# Configuración de Supabase

La aplicación usa Supabase Auth para las cuentas de vendedor y PostgreSQL para productos y reservas. No se conecta a MockAPI ni necesita iniciar el backend local para estas funciones.

## 1. Crear el proyecto y configurar las variables

1. Crea un proyecto en [Supabase](https://supabase.com/dashboard).
2. En **Connect** (o **Project Settings → API Keys**) copia la URL del proyecto y la **Publishable key** (`sb_publishable_...`). No uses una secret key ni `service_role` en la app.
3. Pon esos valores en el `.env` local:

   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://TU_PROJECT_REF.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_TU_CLAVE
   ```

4. Reinicia Expo después de guardar `.env`:

   ```sh
   npx expo start -c
   ```

Las variables `EXPO_PUBLIC_` se incluyen en la aplicación. La publishable key está diseñada para clientes públicos y no es una contraseña; la seguridad de los datos depende de Auth y las políticas RLS.

## 2. Crear la tabla y aplicar RLS

Para una instalación nueva, abre el **SQL Editor** del proyecto y ejecuta [schema.sql](./supabase/schema.sql). Para una instalación existente, ejecuta la migración [20261104_add_atomic_reservations.sql](./supabase/migrations/20261104_add_atomic_reservations.sql) después de la migración de `is_published`. Esta actualización crea `public.reservations`, permite al vendedor leer y actualizar solo el estado de sus reservas, y agrega `reserve_product`, una función transaccional que descuenta inventario y registra el pedido en una única operación. La función valida disponibilidad y datos del cliente para evitar sobreventa incluso con reservas simultáneas. Acepta llamadas públicas únicamente para reservar; los datos de las reservas no se pueden consultar anónimamente.

La tabla `public.products` concede lectura pública y solo usuarios autenticados pueden insertar o actualizar productos cuya columna `seller_id` coincide con su identidad Auth. La cantidad almacenada puede llegar a cero después de las reservas, aunque el formulario del vendedor solo permite publicar cantidades iniciales positivas. No se concede borrado. El SQL no crea usuarios, no guarda contraseñas en tablas y no usa una clave privilegiada.

La tabla almacena `image_url` como texto; la aplicación guarda ahí las fotos como data URL, igual que antes. Conviene usar imágenes pequeñas para evitar registros muy grandes.

## 3. Ajustar Auth

En **Authentication → Providers → Email**, habilita Email si está desactivado y decide si exigir confirmación por correo. Si está activada, el vendedor debe confirmar el correo antes de iniciar sesión. Configura también las URL de redirección permitidas si luego habilitas enlaces de confirmación o recuperación.

El nombre del negocio se guarda como metadato del usuario de Supabase Auth y se copia a cada publicación. Las contraseñas las gestiona Supabase Auth; la aplicación nunca las inserta en la tabla de productos.

Las cuentas y publicaciones que existan en la API local o MockAPI no se migran automáticamente. Cada vendedor debe crear su cuenta de Supabase; no importes contraseñas antiguas. Si necesitas conservar publicaciones previas, migra sus datos de producto por separado después de crear el proyecto.

## SQL que se aplicará

Antes de ejecutar nada, inspecciona el SQL completo en [supabase/schema.sql](./supabase/schema.sql). No se ha ejecutado ningún cambio remoto desde este entorno. El SQL prepara las tablas e índices, habilita RLS, define las políticas de productos y reservas, y establece permisos para `anon` y `authenticated`.

El backend local se conserva en el repositorio, pero la aplicación no lo usa para Auth, productos ni reservas.
