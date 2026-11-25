import { createServer } from 'node:http';
import { createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';

const backendDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(backendDir, 'data');
const uploadsDir = path.join(backendDir, 'uploads');
const productsFile = path.join(dataDir, 'products.json');
const sellersFile = path.join(dataDir, 'sellers.json');
const port = Number(process.env.PORT || 4000);
const maxRequestBytes = 6_000_000;
const passwordHashBytes = 64;
const derivePassword = promisify(scrypt);
const gmailUser = process.env.GMAIL_USER?.trim();
const gmailAppPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '');
const supportEmail = process.env.SUPPORT_EMAIL?.trim() || 'soportenokory@gmail.com';
const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resendFromEmail = process.env.RESEND_FROM_EMAIL?.trim() || 'Nokory Soporte <onboarding@resend.dev>';
const supabaseUrl = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '');
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const publicApiUrl = process.env.PUBLIC_API_URL?.trim();
const approvalSecret = process.env.APPROVAL_SECRET?.trim();
const supportTransporter = gmailUser && gmailAppPassword
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailUser, pass: gmailAppPassword },
    })
  : undefined;
const supportRateLimit = new Map();
const businessRequestRateLimit = new Map();
const supportRateWindowMs = 10 * 60 * 1000;
const supportRateLimitCount = 3;
const allowedImages = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

let writeQueue = Promise.resolve();
let sellerWriteQueue = Promise.resolve();

await mkdir(dataDir, { recursive: true });
await mkdir(uploadsDir, { recursive: true });
try {
  await readFile(productsFile, 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await writeFile(productsFile, '[]\n', 'utf8');
}
try {
  await readFile(sellersFile, 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await writeFile(sellersFile, '[]\n', 'utf8');
}

function send(response, status, payload, extraHeaders = {}) {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8',
    ...extraHeaders,
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, status, message) {
  send(response, status, { message });
}

function sendHtml(response, status, html) {
  response.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  });
  response.end(html);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function getBusinessRequestReviewEndpoint() {
  if (!publicApiUrl) return null;
  try {
    const baseUrl = new URL(publicApiUrl);
    const isLocalHttp = baseUrl.protocol === 'http:'
      && ['localhost', '127.0.0.1'].includes(baseUrl.hostname);
    if (
      (baseUrl.protocol !== 'https:' && !isLocalHttp)
      || baseUrl.username
      || baseUrl.password
      || baseUrl.pathname !== '/'
      || baseUrl.search
      || baseUrl.hash
    ) return null;
    return new URL('/api/business-requests/review', baseUrl).toString();
  } catch {
    return null;
  }
}

function hasApprovalSecret() {
  return Boolean(approvalSecret && Buffer.byteLength(approvalSecret, 'utf8') >= 32);
}

function createBusinessRequestReviewLink(requestId, action, expiresAt) {
  const endpoint = getBusinessRequestReviewEndpoint();
  if (!endpoint || !hasApprovalSecret()) throw new Error('La revisión por correo no está configurada.');
  const signature = createHmac('sha256', approvalSecret)
    .update(`${requestId}.${action}.${expiresAt}`)
    .digest('hex');
  const reviewUrl = new URL(endpoint);
  reviewUrl.searchParams.set('id', requestId);
  reviewUrl.searchParams.set('action', action);
  reviewUrl.searchParams.set('exp', String(expiresAt));
  reviewUrl.searchParams.set('sig', signature);
  return reviewUrl.toString();
}

function verifyBusinessRequestReviewSignature(requestId, action, expiresAt, signature) {
  if (
    !hasApprovalSecret()
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)
    || !['approve', 'reject'].includes(action)
    || !/^\d{1,12}$/.test(expiresAt)
    || !/^[0-9a-f]{64}$/i.test(signature)
  ) return false;
  const expiration = Number(expiresAt);
  if (!Number.isSafeInteger(expiration) || expiration * 1000 <= Date.now()) return false;
  const expected = createHmac('sha256', approvalSecret)
    .update(`${requestId}.${action}.${expiresAt}`)
    .digest();
  const received = Buffer.from(signature, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function parseBusinessRequestReviewParams(params) {
  const allowedFields = new Set(['id', 'action', 'exp', 'sig']);
  const entries = [...params.entries()];
  if (
    entries.length !== allowedFields.size
    || entries.some(([key]) => !allowedFields.has(key))
    || [...allowedFields].some((key) => params.getAll(key).length !== 1)
  ) return null;
  const values = Object.fromEntries(entries);
  return verifyBusinessRequestReviewSignature(values.id, values.action, values.exp, values.sig)
    ? values
    : null;
}

async function readBusinessRequestReviewForm(request) {
  const contentType = request.headers['content-type'];
  if (
    typeof contentType !== 'string'
    || contentType.split(';', 1)[0].trim().toLowerCase() !== 'application/x-www-form-urlencoded'
  ) {
    throw Object.assign(new Error('El formulario de revisión no es válido.'), { status: 415 });
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 4096) {
      throw Object.assign(new Error('El formulario de revisión excede el límite permitido.'), { status: 413 });
    }
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString('utf8');
  return parseBusinessRequestReviewParams(new URLSearchParams(body));
}

function sendBusinessRequestReviewPage(response, status, { title, message, businessName, confirmation }) {
  const businessNameContent = businessName
    ? `<p class="business-name">${escapeHtml(businessName)}</p>`
    : '';
  let confirmationForm = '';
  if (confirmation) {
    const actionLabel = confirmation.action === 'approve' ? 'Aprobar negocio' : 'Rechazar solicitud';
    const hiddenFields = ['id', 'action', 'exp', 'sig']
      .map((field) => `<input type="hidden" name="${field}" value="${escapeHtml(confirmation[field])}">`)
      .join('');
    confirmationForm = `
      <p class="action">Acción: ${actionLabel}</p>
      <form method="post" action="${escapeHtml(confirmation.formAction)}">
        ${hiddenFields}
        <button type="submit">Confirmar</button>
      </form>`;
  }
  sendHtml(response, status, `<!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(title)} | Nokory</title>
      </head>
      <body style="margin:0;padding:24px;background:#FBFAF8;color:#37313B;font-family:Arial,sans-serif">
        <main style="box-sizing:border-box;max-width:520px;margin:48px auto;padding:28px;background:#FFFFFF;border:1px solid #ECE5EF;border-radius:18px">
          <p style="margin:0 0 10px;color:#67914E;font-size:12px;font-weight:700;letter-spacing:1px">NOKORY</p>
          <h1 style="margin:0 0 16px;color:#452064;font-size:24px">${escapeHtml(title)}</h1>
          ${businessNameContent}
          <p style="line-height:1.55">${escapeHtml(message)}</p>
          ${confirmationForm}
        </main>
        <style>
          .business-name{color:#452064;font-size:18px;font-weight:700}
          .action{color:#67914E;font-weight:700}
          button{min-height:48px;padding:0 24px;border:0;border-radius:12px;background:#562A80;color:#FFFFFF;font-size:15px;font-weight:700;cursor:pointer}
        </style>
      </body>
    </html>`);
}

function isRateLimitedSupportRequest(request) {
  const now = Date.now();
  const forwardedFor = request.headers['x-forwarded-for'];
  const clientIp = typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : '';
  const key = clientIp || request.socket.remoteAddress || 'unknown';
  const recentRequests = (supportRateLimit.get(key) || [])
    .filter((timestamp) => now - timestamp < supportRateWindowMs);
  if (recentRequests.length >= supportRateLimitCount) {
    supportRateLimit.set(key, recentRequests);
    return true;
  }
  recentRequests.push(now);
  supportRateLimit.set(key, recentRequests);
  return false;
}

function isRateLimitedBusinessRequest(userId) {
  const now = Date.now();
  for (const [key, timestamps] of businessRequestRateLimit) {
    const recent = timestamps.filter((timestamp) => now - timestamp < supportRateWindowMs);
    if (recent.length) businessRequestRateLimit.set(key, recent);
    else businessRequestRateLimit.delete(key);
  }
  const recentRequests = businessRequestRateLimit.get(userId) || [];
  if (recentRequests.length >= supportRateLimitCount) return true;
  recentRequests.push(now);
  businessRequestRateLimit.set(userId, recentRequests);
  return false;
}

function isValidBusinessEmail(value) {
  return typeof value === 'string'
    && value.length <= 254
    && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value);
}

function parseBusinessRequestPhotoPath(value, userId) {
  if (typeof value !== 'string') return null;
  const [folder, filename, ...extra] = value.split('/');
  if (folder !== userId || !filename || extra.length || filename === '.' || filename === '..') return null;
  if (!/^[A-Za-z0-9._-]{1,250}$/.test(filename)) return null;
  return `${folder}/${filename}`;
}

async function deliverSupportEmail(subject, text, html) {
  if (resendApiKey) {
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: resendFromEmail,
        to: [supportEmail],
        subject,
        text,
        ...(html ? { html } : {}),
      }),
    });
    if (!emailResponse.ok) {
      console.error(`Resend rechazó el correo de soporte (HTTP ${emailResponse.status}).`);
      return false;
    }
    return true;
  }

  await supportTransporter.sendMail({
    from: gmailUser,
    to: supportEmail,
    subject,
    text,
    ...(html ? { html } : {}),
  });
  return true;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxRequestBytes) throw Object.assign(new Error('El archivo excede el límite de 4 MB.'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('El cuerpo debe ser JSON válido.'), { status: 400 });
  }
}

async function readProducts() {
  const contents = await readFile(productsFile, 'utf8');
  const rows = JSON.parse(contents);
  return Array.isArray(rows) ? rows : [];
}

function updateProducts(mutator) {
  const task = writeQueue.then(async () => {
    const rows = await readProducts();
    const result = mutator(rows);
    const temporaryFile = `${productsFile}.${randomUUID()}.tmp`;
    await writeFile(temporaryFile, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
    await rename(temporaryFile, productsFile);
    return result;
  });
  writeQueue = task.catch(() => undefined);
  return task;
}

async function readSellers() {
  const contents = await readFile(sellersFile, 'utf8');
  const rows = JSON.parse(contents);
  if (!Array.isArray(rows)) throw new Error('El archivo de cuentas de vendedor no tiene un formato válido.');
  return rows;
}

function updateSellers(mutator) {
  const task = sellerWriteQueue.then(async () => {
    const sellers = await readSellers();
    const result = mutator(sellers);
    const temporaryFile = `${sellersFile}.${randomUUID()}.tmp`;
    await writeFile(temporaryFile, `${JSON.stringify(sellers, null, 2)}\n`, 'utf8');
    await rename(temporaryFile, sellersFile);
    return result;
  });
  sellerWriteQueue = task.catch(() => undefined);
  return task;
}

async function hashPassword(password, salt) {
  return derivePassword(password, salt, passwordHashBytes);
}

function passwordRequirementError(password) {
  const missing = [];
  if (Array.from(password).length < 8) missing.push('al menos 8 caracteres');
  if (!/\p{Lu}/u.test(password)) missing.push('una letra mayúscula');
  if (!/[0-9]/.test(password)) missing.push('un número');
  return missing.length ? `La contraseña debe tener ${missing.join(', ')}.` : null;
}

async function serveUpload(request, response, pathname) {
  const filename = path.basename(pathname.slice('/uploads/'.length));
  if (!/^[a-f0-9-]+\.(jpg|png|webp)$/i.test(filename)) {
    sendError(response, 404, 'Imagen no encontrada.');
    return;
  }
  try {
    const image = await readFile(path.join(uploadsDir, filename));
    const extension = filename.split('.').pop();
    const contentType = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
    response.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400',
      'Content-Type': contentType,
      'Content-Length': image.length,
    });
    response.end(image);
  } catch (error) {
    if (error.code === 'ENOENT') sendError(response, 404, 'Imagen no encontrada.');
    else throw error;
  }
}

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    response.end();
    return;
  }

  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  try {
    if (request.method === 'GET' && url.pathname === '/api/health') {
      send(response, 200, { status: 'ok' });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/products') {
      await writeQueue;
      const products = (await readProducts())
        .filter((product) => product.isActive !== false)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      send(response, 200, { products });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/support') {
      if (isRateLimitedSupportRequest(request)) {
        sendError(response, 429, 'Se alcanzó el límite de envíos. Inténtalo de nuevo en unos minutos.');
        return;
      }

      const payload = await readJson(request);
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        sendError(response, 400, 'Revisa los datos del formulario de soporte.');
        return;
      }

      const type = payload.type === 'Falla' || payload.type === 'Mejora' ? payload.type : '';
      const role = payload.role === 'seller' || payload.role === 'client' ? payload.role : '';
      const name = typeof payload.name === 'string' ? payload.name.trim().replace(/[\r\n]/g, ' ') : '';
      const comment = typeof payload.comment === 'string' ? payload.comment.trim() : '';
      const phone = typeof payload.phone === 'string' ? payload.phone.trim() : '';
      if (!type || !role || name.length < 1 || name.length > 120 || comment.length < 10 || comment.length > 5000) {
        sendError(response, 400, 'Revisa el tipo, nombre y comentario. El comentario debe tener entre 10 y 5000 caracteres.');
        return;
      }
      if (!/^\d{8}$/.test(phone)) {
        sendError(response, 400, 'El teléfono debe tener 8 dígitos de El Salvador.');
        return;
      }
      if (!resendApiKey && (!supportTransporter || !gmailUser)) {
        sendError(response, 503, 'El servicio de correo no está configurado en el servidor.');
        return;
      }

      const sentAt = new Date();
      const formattedDate = new Intl.DateTimeFormat('es-SV', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'America/El_Salvador',
      }).format(sentAt);
      const roleLabel = role === 'seller' ? 'Vendedor' : 'Cliente';
      const subject = `[Nokory Soporte] ${type} - ${name}`;
      const text = [
        `Tipo: ${type}`,
        `Nombre: ${name}`,
        `Rol: ${roleLabel}`,
        `Teléfono: +503 ${phone}`,
        `Comentario: ${comment}`,
        `Fecha y hora: ${formattedDate} (hora de El Salvador)`,
      ].join('\n');

      try {
        if (!await deliverSupportEmail(subject, text)) {
          sendError(response, 502, 'No se pudo enviar el reporte. Revisa la configuración del correo de soporte.');
          return;
        }
      } catch (error) {
        console.error('No se pudo enviar el reporte de soporte:', error);
        sendError(response, 502, 'No se pudo enviar el reporte. Inténtalo de nuevo más tarde.');
        return;
      }
      send(response, 200, { message: 'Tu comentario fue enviado a soporte.' });
      return;
    }

    if (
      request.method === 'POST'
      && (url.pathname === '/api/business-requests' || url.pathname === '/business-requests')
    ) {
      if (!supabaseUrl || !supabasePublishableKey) {
        sendError(response, 503, 'El servicio de afiliación no está configurado en el servidor.');
        return;
      }

      const authorization = request.headers.authorization;
      const bearerToken = typeof authorization === 'string'
        ? authorization.match(/^Bearer\s+(\S+)$/i)?.[1]
        : null;
      if (!bearerToken) {
        sendError(response, 401, 'Inicia sesión para notificar la solicitud de afiliación.');
        return;
      }

      const payload = await readJson(request);
      if (
        typeof payload !== 'object'
        || payload === null
        || Array.isArray(payload)
        || Object.keys(payload).length !== 1
        || typeof payload.requestId !== 'string'
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.requestId)
      ) {
        sendError(response, 400, 'Envía el identificador válido de la solicitud.');
        return;
      }

      let authResponse;
      try {
        authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
          headers: {
            apikey: supabasePublishableKey,
            Authorization: `Bearer ${bearerToken}`,
          },
        });
      } catch {
        sendError(response, 502, 'No se pudo verificar la sesión con Supabase.');
        return;
      }
      if (!authResponse.ok) {
        sendError(response, 401, 'La sesión no es válida o ha caducado.');
        return;
      }
      const authenticatedUser = await authResponse.json().catch(() => null);
      if (typeof authenticatedUser?.id !== 'string') {
        sendError(response, 401, 'Supabase no confirmó la identidad de la sesión.');
        return;
      }

      const requestFields = 'id,user_id,manager_name,business_name,business_email,business_phone,address,latitude,longitude,description,photo_url,status,created_at';
      const requestUrl = new URL(`${supabaseUrl}/rest/v1/business_requests`);
      requestUrl.searchParams.set('id', `eq.${payload.requestId}`);
      requestUrl.searchParams.set('select', requestFields);
      let businessRequestResponse;
      try {
        businessRequestResponse = await fetch(requestUrl, {
          headers: {
            apikey: supabasePublishableKey,
            Authorization: `Bearer ${bearerToken}`,
          },
        });
      } catch {
        sendError(response, 502, 'No se pudo consultar la solicitud en Supabase.');
        return;
      }
      if (!businessRequestResponse.ok) {
        console.error(`Supabase no permitió consultar la solicitud (HTTP ${businessRequestResponse.status}).`);
        sendError(response, 502, 'No se pudo consultar la solicitud de afiliación.');
        return;
      }
      const businessRequests = await businessRequestResponse.json().catch(() => null);
      const businessRequest = Array.isArray(businessRequests) ? businessRequests[0] : null;
      if (!businessRequest || businessRequest.user_id !== authenticatedUser.id) {
        sendError(response, 404, 'No se encontró una solicitud asociada a esta cuenta.');
        return;
      }
      if (businessRequest.status !== 'pendiente') {
        sendError(response, 409, 'La solicitud ya fue revisada y no se puede volver a notificar.');
        return;
      }
      if (
        typeof businessRequest.manager_name !== 'string'
        || businessRequest.manager_name.trim().length < 2
        || businessRequest.manager_name.length > 120
        || typeof businessRequest.business_name !== 'string'
        || businessRequest.business_name.trim().length < 2
        || businessRequest.business_name.length > 120
        || !isValidBusinessEmail(businessRequest.business_email)
        || typeof businessRequest.business_phone !== 'string'
        || !/^\d{8}$/.test(businessRequest.business_phone)
        || typeof businessRequest.address !== 'string'
        || businessRequest.address.trim().length < 5
        || businessRequest.address.length > 300
        || typeof businessRequest.description !== 'string'
        || businessRequest.description.trim().length < 10
        || businessRequest.description.length > 2000
        || typeof businessRequest.latitude !== 'number'
        || !Number.isFinite(businessRequest.latitude)
        || businessRequest.latitude < -90
        || businessRequest.latitude > 90
        || typeof businessRequest.longitude !== 'number'
        || !Number.isFinite(businessRequest.longitude)
        || businessRequest.longitude < -180
        || businessRequest.longitude > 180
      ) {
        sendError(response, 422, 'La solicitud guardada contiene datos incompletos o no válidos.');
        return;
      }
      const photoPath = businessRequest.photo_url
        ? parseBusinessRequestPhotoPath(businessRequest.photo_url, authenticatedUser.id)
        : null;
      if (businessRequest.photo_url && !photoPath) {
        sendError(response, 422, 'La foto guardada no pertenece a la carpeta de esta cuenta.');
        return;
      }
      if (isRateLimitedBusinessRequest(authenticatedUser.id)) {
        sendError(response, 429, 'Se alcanzó el límite de avisos de afiliación. Inténtalo de nuevo en unos minutos.');
        return;
      }
      const reviewEndpoint = getBusinessRequestReviewEndpoint();
      if (!hasApprovalSecret() || !reviewEndpoint) {
        sendError(response, 503, 'La revisión de solicitudes por correo no está configurada en el servidor.');
        return;
      }
      if (!resendApiKey && (!supportTransporter || !gmailUser)) {
        sendError(response, 503, 'El servicio de correo no está configurado en el servidor.');
        return;
      }

      let photoUrl = null;
      if (photoPath) {
        const encodedPhotoPath = photoPath.split('/').map(encodeURIComponent).join('/');
        let signedPhotoResponse;
        try {
          signedPhotoResponse = await fetch(
            `${supabaseUrl}/storage/v1/object/sign/business-photos/${encodedPhotoPath}`,
            {
              method: 'POST',
              headers: {
                apikey: supabasePublishableKey,
                Authorization: `Bearer ${bearerToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ expiresIn: 604800 }),
            },
          );
        } catch {
          sendError(response, 502, 'No se pudo generar el enlace seguro para la foto del negocio.');
          return;
        }
        if (!signedPhotoResponse.ok) {
          console.error(`Supabase no pudo firmar la foto de afiliación (HTTP ${signedPhotoResponse.status}).`);
          sendError(response, 502, 'No se pudo generar el enlace seguro para la foto del negocio.');
          return;
        }
        const signedPhoto = await signedPhotoResponse.json().catch(() => null);
        const signedPath = signedPhoto?.signedURL || signedPhoto?.signedUrl;
        if (typeof signedPath !== 'string') {
          sendError(response, 502, 'Supabase no devolvió el enlace de la foto del negocio.');
          return;
        }
        photoUrl = signedPath.startsWith('http')
          ? signedPath
          : signedPath.startsWith('/storage/v1/')
            ? `${supabaseUrl}${signedPath}`
            : `${supabaseUrl}/storage/v1${signedPath.startsWith('/') ? '' : '/'}${signedPath}`;
      }

      const sentAt = new Date();
      const formattedDate = new Intl.DateTimeFormat('es-SV', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'America/El_Salvador',
      }).format(sentAt);
      const subjectBusinessName = businessRequest.business_name.trim().replace(/[\r\n]+/g, ' ');
      const subject = `[Nokory] Solicitud de afiliación - ${subjectBusinessName}`;
      const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
      const approveLink = createBusinessRequestReviewLink(businessRequest.id, 'approve', expiresAt);
      const rejectLink = createBusinessRequestReviewLink(businessRequest.id, 'reject', expiresAt);
      const mapsUrl = new URL('https://www.google.com/maps/search/');
      mapsUrl.searchParams.set('api', '1');
      mapsUrl.searchParams.set('query', `${businessRequest.latitude},${businessRequest.longitude}`);
      const emailLines = [
        `Solicitud: ${businessRequest.id}`,
        `Estado: ${businessRequest.status}`,
        `Encargado: ${businessRequest.manager_name.trim()}`,
        `Negocio: ${businessRequest.business_name.trim()}`,
        `Correo: ${businessRequest.business_email.trim()}`,
        `Teléfono: +503 ${businessRequest.business_phone.slice(0, 4)}-${businessRequest.business_phone.slice(4)}`,
        `Dirección: ${businessRequest.address.trim()}`,
        `Ubicación: ${businessRequest.latitude}, ${businessRequest.longitude}`,
        `Google Maps: ${mapsUrl.toString()}`,
        `Descripción: ${businessRequest.description.trim()}`,
        `Fecha de solicitud: ${businessRequest.created_at}`,
        `Aviso enviado: ${formattedDate} (hora de El Salvador)`,
        `Aprobar negocio: ${approveLink}`,
        `Rechazar solicitud: ${rejectLink}`,
      ];
      if (photoUrl) emailLines.splice(8, 0, `Foto del negocio: ${photoUrl}`);
      const text = emailLines.join('\n');
      const safe = (value) => escapeHtml(value);
      const photoMarkup = photoUrl
        ? `<p><strong>Foto del negocio</strong><br><a href="${safe(photoUrl)}">Ver foto</a><br><img src="${safe(photoUrl)}" alt="Foto del negocio" style="max-width:320px;height:auto"></p>`
        : '';
      const html = `<!doctype html>
        <html lang="es">
          <body style="margin:0;padding:24px;background:#FBFAF8;color:#37313B;font-family:Arial,sans-serif">
            <main style="max-width:640px;margin:0 auto;padding:24px;background:#FFFFFF;border:1px solid #ECE5EF;border-radius:16px">
              <p style="color:#67914E;font-size:12px;font-weight:700;letter-spacing:1px">NOKORY</p>
              <h1 style="color:#452064;font-size:22px">Solicitud de afiliación de negocio</h1>
              <p><strong>Encargado:</strong> ${safe(businessRequest.manager_name.trim())}</p>
              <p><strong>Negocio:</strong> ${safe(businessRequest.business_name.trim())}</p>
              <p><strong>Correo:</strong> ${safe(businessRequest.business_email.trim())}</p>
              <p><strong>Teléfono:</strong> +503 ${safe(businessRequest.business_phone.slice(0, 4))}-${safe(businessRequest.business_phone.slice(4))}</p>
              <p><strong>Dirección:</strong> ${safe(businessRequest.address.trim())}</p>
              <p><strong>Ubicación:</strong> <a href="${safe(mapsUrl.toString())}">Ver en Google Maps</a></p>
              <p><strong>Descripción:</strong><br>${safe(businessRequest.description.trim()).replace(/\r?\n/g, '<br>')}</p>
              ${photoMarkup}
              <p><strong>Fecha de solicitud:</strong> ${safe(businessRequest.created_at)}</p>
              <p style="margin-top:28px">
                <a role="button" href="${safe(approveLink)}" style="display:inline-block;margin:0 10px 10px 0;padding:13px 18px;border-radius:10px;background:#67914E;color:#FFFFFF;font-weight:700;text-decoration:none">Aprobar negocio</a>
                <a role="button" href="${safe(rejectLink)}" style="display:inline-block;margin:0 10px 10px 0;padding:13px 18px;border-radius:10px;background:#562A80;color:#FFFFFF;font-weight:700;text-decoration:none">Rechazar solicitud</a>
              </p>
              <p style="color:#827A86;font-size:12px">Los enlaces de revisión vencen en siete días y requieren confirmación antes de aplicar el cambio.</p>
            </main>
          </body>
        </html>`;

      try {
        if (!await deliverSupportEmail(subject, text, html)) {
          sendError(response, 502, 'No se pudo enviar la solicitud. Revisa la configuración del correo de soporte.');
          return;
        }
      } catch (error) {
        console.error('No se pudo enviar el aviso de afiliación:', error);
        sendError(response, 502, 'No se pudo enviar el aviso de afiliación. Inténtalo de nuevo más tarde.');
        return;
      }

      send(response, 200, { message: 'La solicitud de afiliación fue enviada a soporte.' });
      return;
    }

    if (
      request.method === 'GET'
      && url.pathname === '/api/business-requests/review'
    ) {
      if (!supabaseUrl || !supabaseServiceRoleKey || !hasApprovalSecret() || !getBusinessRequestReviewEndpoint()) {
        sendBusinessRequestReviewPage(response, 503, {
          title: 'Revisión no disponible',
          message: 'El servicio de revisión de solicitudes no está configurado.',
        });
        return;
      }
      const review = parseBusinessRequestReviewParams(url.searchParams);
      if (!review) {
        sendBusinessRequestReviewPage(response, 403, {
          title: 'Enlace no válido',
          message: 'El enlace de revisión no es válido o ya venció.',
        });
        return;
      }

      const requestUrl = new URL(`${supabaseUrl}/rest/v1/business_requests`);
      requestUrl.searchParams.set('id', `eq.${review.id}`);
      requestUrl.searchParams.set('select', 'business_name,status');
      let businessRequestResponse;
      try {
        businessRequestResponse = await fetch(requestUrl, {
          headers: {
            apikey: supabaseServiceRoleKey,
            Authorization: `Bearer ${supabaseServiceRoleKey}`,
          },
        });
      } catch {
        sendBusinessRequestReviewPage(response, 502, {
          title: 'No se pudo consultar la solicitud',
          message: 'Inténtalo de nuevo más tarde.',
        });
        return;
      }
      if (!businessRequestResponse.ok) {
        console.error(`Supabase no permitió consultar la solicitud para revisión (HTTP ${businessRequestResponse.status}).`);
        sendBusinessRequestReviewPage(response, 502, {
          title: 'No se pudo consultar la solicitud',
          message: 'Inténtalo de nuevo más tarde.',
        });
        return;
      }
      const businessRequests = await businessRequestResponse.json().catch(() => null);
      const businessRequest = Array.isArray(businessRequests) ? businessRequests[0] : null;
      if (!businessRequest || typeof businessRequest.business_name !== 'string') {
        sendBusinessRequestReviewPage(response, 404, {
          title: 'Solicitud no encontrada',
          message: 'No se encontró la solicitud asociada a este enlace.',
        });
        return;
      }
      if (businessRequest.status !== 'pendiente') {
        sendBusinessRequestReviewPage(response, 409, {
          title: 'Solicitud ya revisada',
          businessName: businessRequest.business_name,
          message: 'Esta solicitud ya fue revisada y no admite nuevos cambios.',
        });
        return;
      }
      sendBusinessRequestReviewPage(response, 200, {
        title: 'Confirmar revisión',
        businessName: businessRequest.business_name,
        message: 'Confirma la acción para actualizar el estado de la solicitud.',
        confirmation: {
          ...review,
          formAction: getBusinessRequestReviewEndpoint(),
        },
      });
      return;
    }

    if (
      request.method === 'POST'
      && url.pathname === '/api/business-requests/review'
    ) {
      if (!supabaseUrl || !supabaseServiceRoleKey || !hasApprovalSecret() || !getBusinessRequestReviewEndpoint()) {
        sendBusinessRequestReviewPage(response, 503, {
          title: 'Revisión no disponible',
          message: 'El servicio de revisión de solicitudes no está configurado.',
        });
        return;
      }
      let review;
      try {
        review = await readBusinessRequestReviewForm(request);
      } catch (error) {
        sendBusinessRequestReviewPage(response, error.status || 400, {
          title: 'Formulario no válido',
          message: error.message || 'No se pudo leer el formulario de revisión.',
        });
        return;
      }
      if (!review) {
        sendBusinessRequestReviewPage(response, 403, {
          title: 'Enlace no válido',
          message: 'El enlace de revisión no es válido o ya venció.',
        });
        return;
      }

      const updateUrl = new URL(`${supabaseUrl}/rest/v1/business_requests`);
      updateUrl.searchParams.set('id', `eq.${review.id}`);
      updateUrl.searchParams.set('status', 'eq.pendiente');
      updateUrl.searchParams.set('select', 'id,business_name,status');
      const nextStatus = review.action === 'approve' ? 'aprobada' : 'rechazada';
      const updateFields = {
        status: nextStatus,
        reviewed_at: new Date().toISOString(),
        ...(review.action === 'reject'
          ? { rejection_reason: 'Solicitud rechazada tras la revisión de soporte.' }
          : {}),
      };
      let updateResponse;
      try {
        updateResponse = await fetch(updateUrl, {
          method: 'PATCH',
          headers: {
            apikey: supabaseServiceRoleKey,
            Authorization: `Bearer ${supabaseServiceRoleKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify(updateFields),
        });
      } catch {
        sendBusinessRequestReviewPage(response, 502, {
          title: 'No se pudo guardar la revisión',
          message: 'Inténtalo de nuevo más tarde.',
        });
        return;
      }
      if (!updateResponse.ok) {
        console.error(`Supabase no pudo actualizar la solicitud (HTTP ${updateResponse.status}).`);
        sendBusinessRequestReviewPage(response, 502, {
          title: 'No se pudo guardar la revisión',
          message: 'No se actualizó la solicitud. Inténtalo de nuevo más tarde.',
        });
        return;
      }
      const updatedRequests = await updateResponse.json().catch(() => null);
      const updatedRequest = Array.isArray(updatedRequests) ? updatedRequests[0] : null;
      if (!updatedRequest) {
        sendBusinessRequestReviewPage(response, 409, {
          title: 'Solicitud ya revisada',
          message: 'La solicitud ya no está pendiente. No se realizaron cambios.',
        });
        return;
      }
      if (updatedRequest.status !== nextStatus || typeof updatedRequest.business_name !== 'string') {
        sendBusinessRequestReviewPage(response, 502, {
          title: 'No se pudo confirmar la revisión',
          message: 'La respuesta de Supabase no confirmó el estado solicitado.',
        });
        return;
      }
      sendBusinessRequestReviewPage(response, 200, {
        title: review.action === 'approve' ? 'Negocio aprobado' : 'Solicitud rechazada',
        businessName: updatedRequest.business_name,
        message: review.action === 'approve'
          ? 'El negocio fue aprobado y quedó habilitado por la base de datos.'
          : 'La solicitud fue rechazada y se guardó el motivo de revisión.',
      });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/seller/register') {
      const payload = await readJson(request);
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        sendError(response, 400, 'Envía el correo, nombre del negocio y contraseña.');
        return;
      }

      const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
      const businessName = typeof payload.businessName === 'string' ? payload.businessName.trim() : '';
      const password = typeof payload.password === 'string' ? payload.password : '';
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        sendError(response, 400, 'Escribe un correo electrónico válido.');
        return;
      }
      if (businessName.length < 2) {
        sendError(response, 400, 'Escribe el nombre de tu negocio.');
        return;
      }
      const passwordError = passwordRequirementError(password);
      if (passwordError) {
        sendError(response, 400, passwordError);
        return;
      }

      const salt = randomBytes(16).toString('hex');
      const passwordHash = (await hashPassword(password, salt)).toString('hex');
      const created = await updateSellers((sellers) => {
        if (sellers.some((seller) => seller.email === email)) return false;
        sellers.push({
          email,
          businessName,
          passwordSalt: salt,
          passwordHash,
          createdAt: new Date().toISOString(),
        });
        return true;
      });
      if (!created) {
        sendError(response, 409, 'Ya existe una cuenta de vendedor con ese correo.');
        return;
      }
      send(response, 201, { seller: { email, businessName } });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/seller/login') {
      const payload = await readJson(request);
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        sendError(response, 400, 'Escribe el correo y la contraseña de tu cuenta de vendedor.');
        return;
      }

      const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
      const password = typeof payload.password === 'string' ? payload.password : '';
      await sellerWriteQueue;
      const seller = (await readSellers()).find((account) => account.email === email);
      const salt = seller?.passwordSalt || 'nokory-missing-seller-account';
      const expectedHash = seller ? Buffer.from(seller.passwordHash, 'hex') : Buffer.alloc(passwordHashBytes);
      const suppliedHash = await hashPassword(password, salt);
      const passwordMatches = expectedHash.length === passwordHashBytes
        && timingSafeEqual(suppliedHash, expectedHash);
      if (!seller || !passwordMatches) {
        sendError(response, 401, 'El correo o la contraseña no corresponden a una cuenta de vendedor.');
        return;
      }
      send(response, 200, { seller: { email: seller.email, businessName: seller.businessName } });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/uploads') {
      const payload = await readJson(request);
      const extension = allowedImages.get(payload.mimeType);
      if (!extension || typeof payload.base64 !== 'string') {
        sendError(response, 400, 'Usa una foto JPEG, PNG o WebP válida.');
        return;
      }
      const image = Buffer.from(payload.base64, 'base64');
      if (image.length === 0 || image.length > 4 * 1024 * 1024) {
        sendError(response, 413, 'La foto debe pesar menos de 4 MB.');
        return;
      }
      const filename = `${randomUUID()}.${extension}`;
      await writeFile(path.join(uploadsDir, filename), image, { flag: 'wx' });
      const forwardedProtocol = request.headers['x-forwarded-proto'];
      const protocol = typeof forwardedProtocol === 'string' ? forwardedProtocol.split(',')[0] : 'http';
      const host = request.headers.host || `localhost:${port}`;
      send(response, 201, { imageUrl: `${protocol}://${host}/uploads/${filename}` });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/products') {
      const payload = await readJson(request);
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      const description = typeof payload.description === 'string' ? payload.description.trim() : '';
      const sellerName = typeof payload.sellerName === 'string' ? payload.sellerName.trim() : '';
      const category = typeof payload.category === 'string' ? payload.category.trim() : '';
      const price = Number(payload.price);
      const quantity = Number(payload.quantity);
      const pickupStart = typeof payload.pickupStart === 'string' ? payload.pickupStart.trim() : '';
      const pickupEnd = typeof payload.pickupEnd === 'string' ? payload.pickupEnd.trim() : '';
      if (name.length < 3 || name.length > 100 || description.length > 500 || !sellerName || !category || !pickupStart || !pickupEnd || !Number.isFinite(price) || price <= 0 || !Number.isInteger(quantity) || quantity < 1) {
        sendError(response, 400, 'Revisa el nombre, precio, cantidad y horario del producto.');
        return;
      }
      if (payload.imageUrl && (typeof payload.imageUrl !== 'string' || !payload.imageUrl.startsWith('http'))) {
        sendError(response, 400, 'La foto debe tener una URL válida.');
        return;
      }
      const product = {
        id: randomUUID(),
        name,
        description,
        category,
        price: Number(price.toFixed(2)),
        quantity,
        pickupStart,
        pickupEnd,
        sellerName,
        imageUrl: payload.imageUrl || null,
        createdAt: new Date().toISOString(),
        isActive: true,
      };
      await updateProducts((rows) => rows.unshift(product));
      send(response, 201, { product });
      return;
    }

    if (request.method === 'GET' && url.pathname.startsWith('/uploads/')) {
      await serveUpload(request, response, url.pathname);
      return;
    }

    sendError(response, 404, 'Ruta de API no encontrada.');
  } catch (error) {
    sendError(response, error.status || 500, error.status ? error.message : 'Error interno de la API.');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`API Nokory escuchando en http://0.0.0.0:${port}`);
  console.log('Los datos se guardan en backend/data y las fotos en backend/uploads.');
});
