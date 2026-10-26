import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(backendDir, 'data');
const uploadsDir = path.join(backendDir, 'uploads');
const productsFile = path.join(dataDir, 'products.json');
const port = Number(process.env.PORT || 4000);
const maxRequestBytes = 6_000_000;
const allowedImages = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

let writeQueue = Promise.resolve();

await mkdir(dataDir, { recursive: true });
await mkdir(uploadsDir, { recursive: true });
try {
  await readFile(productsFile, 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await writeFile(productsFile, '[]\n', 'utf8');
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
