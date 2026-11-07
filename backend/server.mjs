import { createServer } from 'node:http';
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
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
const supportTransporter = gmailUser && gmailAppPassword
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailUser, pass: gmailAppPassword },
    })
  : undefined;
const supportRateLimit = new Map();
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
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
    ...extraHeaders,
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, status, message) {
  send(response, status, { message });
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
      'Access-Control-Allow-Headers': 'Content-Type',
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
            }),
          });
          if (!emailResponse.ok) {
            console.error(`Resend rechazó el correo de soporte (HTTP ${emailResponse.status}).`);
            sendError(response, 502, 'No se pudo enviar el reporte. Revisa la configuración del correo de soporte.');
            return;
          }
        } else {
          await supportTransporter.sendMail({
            from: gmailUser,
            to: supportEmail,
            subject,
            text,
          });
        }
      } catch (error) {
        console.error('No se pudo enviar el reporte de soporte:', error);
        sendError(response, 502, 'No se pudo enviar el reporte. Inténtalo de nuevo más tarde.');
        return;
      }
      send(response, 200, { message: 'Tu comentario fue enviado a soporte.' });
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
