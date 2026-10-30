# Configuración de Supabase

La aplicación usa Supabase Auth para las cuentas de vendedor y PostgreSQL para los productos. No se conecta a MockAPI ni necesita iniciar el backend local para estas funciones.

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

Abre el **SQL Editor** del proyecto, revisa [schema.sql](./supabase/schema.sql) y ejecútalo allí. Este SQL crea `public.products`, habilita RLS y concede lectura pública. Solo usuarios autenticados pueden insertar o actualizar productos cuya columna `seller_id` coincide con su identidad Auth. No concede borrado. El SQL no crea usuarios, no guarda contraseñas en tablas y no usa una clave privilegiada.

La tabla almacena `image_url` como texto; la aplicación guarda ahí las fotos como data URL, igual que antes. Conviene usar imágenes pequeñas para evitar registros muy grandes.

## 3. Ajustar Auth

En **Authentication → Providers → Email**, habilita Email si está desactivado y decide si exigir confirmación por correo. Si está activada, el vendedor debe confirmar el correo antes de iniciar sesión. Configura también las URL de redirección permitidas si luego habilitas enlaces de confirmación o recuperación.

El nombre del negocio se guarda como metadato del usuario de Supabase Auth y se copia a cada publicación. Las contraseñas las gestiona Supabase Auth; la aplicación nunca las inserta en la tabla de productos.

Las cuentas y publicaciones que existan en la API local o MockAPI no se migran automáticamente. Cada vendedor debe crear su cuenta de Supabase; no importes contraseñas antiguas. Si necesitas conservar publicaciones previas, migra sus datos de producto por separado después de crear el proyecto.

## SQL que se aplicará

Antes de ejecutar nada, inspecciona el SQL completo en [supabase/schema.sql](./supabase/schema.sql). No se ha ejecutado ningún cambio remoto. El SQL crea una tabla e índice si no existen, habilita RLS, reemplaza las tres políticas con nombres propios y establece permisos para `anon` y `authenticated`.

El backend local se conserva en el repositorio, pero la aplicación no lo usa para Auth ni productos.
