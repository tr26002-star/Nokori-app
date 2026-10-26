# API local de Nokory

Esta API guarda las publicaciones en `backend/data/products.json` y las fotos en `backend/uploads/`. El servidor debe permanecer encendido para que los otros teléfonos puedan ver las publicaciones. Esta configuración está pensada para una demostración con equipos conectados a la misma red Wi‑Fi.

## Iniciar el servidor

1. En la computadora que ejecutará la API, abre una terminal dentro de `Nokori-app`.
2. Ejecuta `npm install` si aún no instalaste las dependencias del proyecto.
3. Inicia el servidor con:

   ```sh
   npm run api
   ```

La API escucha en el puerto `4000`. Puedes comprobar que está activa abriendo `http://localhost:4000/api/health` en esa computadora; debe responder `{"status":"ok"}`.

## Conectar los teléfonos

1. Conecta los teléfonos y la computadora a la misma red Wi‑Fi.
2. En Windows, ejecuta `ipconfig` y busca la dirección IPv4 de la conexión Wi‑Fi de la computadora, por ejemplo `192.168.1.25`.
3. Copia `.env.example` como `.env` y cambia la dirección por la IP encontrada:

   ```env
   EXPO_PUBLIC_API_URL=http://192.168.1.25:4000/api
   ```

4. Reinicia Expo para que lea `.env`:

   ```sh
   npx expo start -c
   ```

5. Abre Expo Go en cada teléfono y escanea el QR. Si Windows pregunta, permite el acceso del servidor en redes privadas.

No uses `localhost` en `.env`: en cada teléfono, `localhost` apuntaría al propio teléfono, no a la computadora que tiene los datos.

## Rutas de la API

- `GET /api/health`: confirma que el servidor está activo.
- `GET /api/products`: devuelve las publicaciones compartidas.
- `POST /api/products`: guarda un producto.
- `POST /api/uploads`: guarda una foto JPEG, PNG o WebP y devuelve su URL.
- `GET /uploads/:archivo`: entrega una foto guardada.

Explorar consulta la API cada cinco segundos. Los datos y las fotos permanecen en la computadora del servidor. Haz una copia de `backend/data/products.json` y `backend/uploads/` si quieres conservarlos fuera de esa computadora.

Esta API local no requiere cuentas ni claves y funciona cuando todos los dispositivos alcanzan la computadora por la red. Para que personas desde cualquier red del Internet la usen, habrá que alojar el servidor en un servicio público con almacenamiento persistente y agregar autenticación antes de abrir escrituras al público.
