# Configuración de Supabase

La aplicación usa Supabase Auth para las cuentas y PostgreSQL para negocios, productos y reservas. Todas las cuentas se registran e inician sesión en modo cliente; el modo negocio solo está disponible para usuarios con un negocio aprobado. No se conecta a MockAPI ni necesita iniciar el backend local para estas funciones.

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

**Configuración vigente para cuentas únicas:** en una instalación nueva ejecuta [schema.sql](./supabase/schema.sql) y después las migraciones [20261107100000_client_accounts_approved_businesses.sql](./supabase/migrations/20261107100000_client_accounts_approved_businesses.sql), [20261108100000_profiles_business_locations_nearby_products.sql](./supabase/migrations/20261108100000_profiles_business_locations_nearby_products.sql), [20261109100000_business_affiliation_business_mode.sql](./supabase/migrations/20261109100000_business_affiliation_business_mode.sql) y [20261124100000_server_pricing_simulated_payments.sql](./supabase/migrations/20261124100000_server_pricing_simulated_payments.sql), en ese orden. En instalaciones existentes aplica las migraciones después de las migraciones de reservas. La migración de afiliación crea `public.business_requests`, el bucket privado `business-photos`, la relación `products.business_id`, las políticas RLS de aprobación y el bloqueo de reservas propias. Los usuarios solo pueden leer sus solicitudes e insertar solicitudes pendientes; la aprobación administrativa se realiza actualizando su estado desde Supabase.

En **Authentication → Providers → Email**, activa **Confirm email**. El registro requiere nombre completo, correo, contraseña, foto de perfil y aceptación de las normas. La foto se conserva temporalmente en el dispositivo durante la confirmación y se carga al bucket `avatars` en el primer inicio de sesión; completa ese acceso desde el dispositivo en el que se registró la cuenta. Los archivos se guardan bajo la carpeta del UID y se leen mediante URL firmadas. Solo los negocios de `public.businesses` con `owner_id` igual al UID de Auth y `status = 'approved'` habilitan el modo vendedor.

La migración `20261108100000_profiles_business_locations_nearby_products.sql` crea automáticamente una fila privada en `public.profiles` por cuenta y migra las fotos de perfil guardadas anteriormente en los metadatos de Auth. La migración de afiliación sincroniza `business_requests.status = 'aprobada'` con `public.businesses` y las publicaciones existentes del propietario. La solicitud rechazada requiere un motivo; el usuario puede consultar el estado, pero no editar ni borrar la solicitud. Una solicitud previa impide crear otra desde la app. Explorar solo devuelve ofertas de negocios aprobados con dirección y coordenadas, productos publicados y stock. El radio inicial es de 3 km; se puede elegir 2 o 5 km. La ubicación del cliente se consulta en primer plano y nunca se guarda en la base de datos. No inventes ni reutilices coordenadas aproximadas: la precisión del filtro y de Google Maps depende de datos verificados.

El permiso de ubicación en iOS se declara en `app.json`; Android incorpora los permisos de primer plano y presenta el texto localizado por el sistema operativo. Si el usuario deniega el permiso de forma permanente, la aplicación puede abrir los ajustes del sistema.

Para una instalación nueva, abre el **SQL Editor** del proyecto y ejecuta [schema.sql](./supabase/schema.sql). Para una instalación existente, ejecuta la migración [20261104_add_atomic_reservations.sql](./supabase/migrations/20261104_add_atomic_reservations.sql) después de la migración de `is_published`. Esta actualización crea `public.reservations`, permite al vendedor leer y actualizar solo el estado de sus reservas, y agrega `reserve_product`, una función transaccional que descuenta inventario y registra el pedido en una única operación. La función valida disponibilidad y datos del cliente para evitar sobreventa incluso con reservas simultáneas. La sesión de cliente debe estar autenticada; RLS y las funciones RPC limitan la lectura y cancelación a reservas de esa cuenta.

Los clientes se registran e inician sesión con correo y contraseña mediante `signUp` y `signInWithPassword` de Supabase Auth; el inicio de sesión no solicita OTP ni enlaces mágicos. En **Authentication → Providers → Email**, mantén Email habilitado. La confirmación de correo, si está activada, solo se aplica al registro y no se debe deshabilitar globalmente para evitar cambiar las protecciones de vendedores. No hace falta habilitar Phone Auth ni configurar un proveedor SMS para los clientes. La sesión se conserva en AsyncStorage, según el patrón existente. Las reservas guardan el `auth.uid()` en `customer_id`; el teléfono de contacto para la recogida es un dato aparte y no determina la propiedad de la reserva.

Para instalaciones existentes, aplica [20261106000000_reservations_by_client_account.sql](./supabase/migrations/20261106000000_reservations_by_client_account.sql) después de crear `public.reservations` con las migraciones del sistema. Si aún no las aplicaste, aplica también [20261106010000_client_phone_password_auth.sql](./supabase/migrations/20261106010000_client_phone_password_auth.sql) y [20261106020000_client_email_password_auth.sql](./supabase/migrations/20261106020000_client_email_password_auth.sql). Finalmente aplica [20261106030000_reconcile_legacy_reservation_owners.sql](./supabase/migrations/20261106030000_reconcile_legacy_reservation_owners.sql). Esta última completa `customer_id` únicamente cuando el teléfono de la reserva coincide con el teléfono confirmado de exactamente una cuenta de Auth; deja sin cambiar todos los demás datos, incluidos estado y fecha. No crea ni duplica reservas. Las políticas y RPC existentes filtran por el UID de la sesión.

Las reservas existentes están en `public.reservations`; el cliente las lee de Supabase y no las guarda en AsyncStorage ni en el backend local. No hace falta importar almacenamiento del dispositivo. La migración nueva deja un reporte de los casos no vinculables en `private.reservation_customer_link_issues`, un esquema privado sin permisos para `anon` ni `authenticated`. Desde el SQL Editor de Supabase, consulta el reporte:

```sql
select reservation_id, customer_phone, normalized_phone,
       matching_accounts, verified_matching_accounts, reason
from private.reservation_customer_link_issues
order by recorded_at, reservation_id;
```

Los motivos posibles son `invalid_or_unsupported_phone`, `no_matching_account`, `phone_not_verified` y `multiple_matching_accounts`. Para resolverlos, verifica con el cliente qué cuenta le pertenece y que el número no haya sido reasignado a otra persona; confirma o actualiza el teléfono en esa misma cuenta de Auth y vuelve a ejecutar la migración solo después de validar la propiedad histórica. Si hay varias cuentas posibles o el teléfono no identifica al propietario, no asignes automáticamente: solo después de verificación administrativa manual se puede actualizar esa reserva específica, conservando su ID y datos, con `update public.reservations set customer_id = '<UID confirmado>' where id = '<reservation_id>' and customer_id is null;`. La migración puede volver a ejecutarse y no sobrescribe vínculos existentes.

Las cuentas y reservas existentes se conservan. Una cuenta anterior creada solo con teléfono puede no tener correo/contraseña; su propietario deberá establecer correo y contraseña en la misma cuenta de Auth para conservar su UID y reservas. No se reasignan reservas a una cuenta nueva automáticamente. La migración de propiedad anterior ya vinculó coincidencias únicas verificadas; la migración nueva solo completa vínculos nulos que pueda demostrar inequívocamente y documenta los demás para resolución manual.

La migración antigua [20261105030000_reconcile_cancel_reservation.sql](./supabase/migrations/20261105030000_reconcile_cancel_reservation.sql) solo se necesita si aún no se instala la nueva migración de propiedad por cuenta y se requiere reparar temporalmente la cancelación anterior.

Para comprobar el aislamiento, con Email Auth y las migraciones aplicadas:

1. Registra o inicia sesión como cliente con el correo A, reserva un producto y confirma que aparece en **Mis reservas**.
2. Cancela esa reserva y confirma que desaparece de activas y aparece una sola vez en **Historial** como **Cancelada**. Crea otra reserva y marca su entrega desde la cuenta de vendedor; confirma que aparece en el historial como **Recogida**.
3. Cierra sesión, inicia sesión con la cuenta B y confirma que no aparecen reservas de A; crea una reserva para B.
4. Cierra sesión, vuelve a iniciar sesión con A y confirma que siguen su reserva cancelada y recogida, pero no la reserva de B.

### Reservas del vendedor, recogidas y packs no retirados

Para instalaciones existentes, aplica una sola vez la migración [20261106100000_seller_reservations_pickup_no_show.sql](./supabase/migrations/20261106100000_seller_reservations_pickup_no_show.sql) en el SQL Editor, después de las migraciones de reservas y propietarios. La pantalla del vendedor consulta las reservas de los productos que posee y se actualiza al abrirla y cada 20 segundos mientras permanece visible. Cada reserva aparece por cliente con su cantidad, importe y el mismo código de recogida que ve el cliente.

El vendedor puede marcar una reserva pendiente como **Recogida** o, tras finalizar el horario de recogida y confirmar que el cliente no llegó, como **No recogida**. Esta última acción cambia el estado y devuelve los packs al inventario en una sola transacción; no se puede aplicar dos veces. La reserva aparece en el Historial del cliente como **No recogida**. Aplica la migración antes de probar los botones.

La lectura directa de `public.products` queda limitada al propietario del negocio aprobado; las RPC de cliente entregan solo ofertas publicadas y el precio final calculado en el servidor. Cada producto nuevo debe tener `business_id` asociado a un negocio aprobado cuyo `owner_id` coincide con `seller_id`; la migración relaciona los productos existentes por propietario y reemplaza el nombre duplicado `seller_name` con el nombre canónico del negocio. Los usuarios de modo negocio también pueden leer sus publicaciones despublicadas. La cantidad almacenada puede llegar a cero después de las reservas, aunque el formulario solo permite cantidades iniciales positivas. No se concede borrado. `reserve_product` rechaza la reserva si el cliente es dueño del negocio, incluso si abrió el producto desde un enlace directo.

### Precios y pago simulado

Aplica [20261124100000_server_pricing_simulated_payments.sql](./supabase/migrations/20261124100000_server_pricing_simulated_payments.sql) después de las migraciones anteriores. La migración guarda el precio normal del negocio, exige precio normal mayor que el de rescate y bloquea publicar por debajo de $3.50; publicaciones antiguas inferiores a ese mínimo se despublican, sin cambiar sus precios ni reservas históricas. Las lecturas de productos para clientes se realizan mediante RPC y devuelven el precio final calculado en PostgreSQL. La constante `v_commission_per_unit` fija la comisión en $0.75; `v_vat_rate` y `v_vat_treatment` quedan en la función `get_nokory_pricing` para ajustarlos cuando se confirme el criterio fiscal. El cliente no recibe un desglose de comisión ni IVA.

La compra actual es una simulación: no solicita ni guarda datos de tarjeta ni requiere configurar Wompi o Render. `reserve_product` vuelve a calcular el total, descuenta el inventario y registra `commission_amount`, `total_paid`, `payment_status = 'pagada_simulada'` y `payment_provider = 'wompi_simulado'`. La cancelación sigue utilizando su RPC existente para devolver unidades al inventario.

Prueba en un proyecto Supabase de desarrollo después de aplicar la migración:

1. Como negocio aprobado, publica un producto con precio de rescate de $3.50 y confirma que se muestra el precio final devuelto por el servidor. Prueba $3.49 y verifica el mensaje del formulario; intenta además insertar o publicar ese precio directamente para confirmar que el trigger lo rechaza.
2. Desde una cuenta cliente, cambia la cantidad en el detalle y verifica que el total se actualiza con la cotización del servidor. Pulsa **Pagar con Wompi (simulación)** sin introducir datos de tarjeta.
3. En `public.reservations`, comprueba que la reserva registra comisión de $0.75 por pack, total cobrado, `pagada_simulada` y `wompi_simulado`. Verifica que Explorar, el ticket y Mis reservas muestran únicamente el total.
4. Cancela la reserva y confirma que el estado cambia y el inventario se repone como antes.

En **Authentication → Rate Limits**, configura límites de registro por IP adecuados para el tráfico esperado y conserva **Confirm email** habilitado en el proveedor Email. Estas opciones se configuran manualmente en el panel de Supabase; la aplicación no contiene una `service_role` key.

La tabla almacena `image_url` como texto; la aplicación guarda ahí las fotos como data URL, igual que antes. Conviene usar imágenes pequeñas para evitar registros muy grandes.

## 3. Ajustar Auth

La configuración anterior de esta sección queda sustituida para el flujo actual: habilita **Email** y activa **Confirm email**. La aplicación rechaza nuevos registros si Supabase devuelve una sesión inmediata. Todos los usuarios inician sesión con correo y contraseña como clientes; no hay selección de rol ni registro directo de vendedor. El nombre del negocio se obtiene únicamente de `public.businesses`, nunca de los metadatos de Auth.

En **Authentication → Providers → Email**, habilita Email si está desactivado y conserva la política de confirmación existente. El inicio de sesión de clientes y vendedores usa correo/contraseña; la app no llama a OTP ni magic-link. Si la confirmación está activada, los usuarios nuevos deben confirmar el correo una vez antes de iniciar sesión. No es necesario cambiar la configuración de confirmación ni SMS de otros roles.

El nombre de la persona se guarda en `public.profiles`; la fecha de aceptación de las normas permanece en los metadatos de Supabase Auth. El nombre del negocio se obtiene exclusivamente de `public.businesses`; las contraseñas las gestiona Supabase Auth y nunca se insertan en la tabla de productos.

Las cuentas y publicaciones que existan en la API local o MockAPI no se migran automáticamente. Cada persona debe crear una cuenta de cliente en Supabase; los negocios aprobados se registran mediante el proceso administrativo. No importes contraseñas antiguas. Si necesitas conservar publicaciones previas, migra sus datos de producto por separado después de crear el proyecto.

## SQL que se aplicará

Antes de ejecutar nada, inspecciona el SQL completo en [supabase/schema.sql](./supabase/schema.sql). No se ha ejecutado ningún cambio remoto desde este entorno. El SQL prepara las tablas e índices, habilita RLS, define las políticas de productos y reservas, y establece permisos para `anon` y `authenticated`.

El backend local se conserva en el repositorio, pero la aplicación no lo usa para Auth, productos ni reservas.

## Afiliar un negocio y revisar la solicitud

El usuario inicia sesión en modo cliente y puede enviar una sola solicitud desde Perfil → Configuración → Afiliar negocio. La imagen se guarda de forma privada en `business-photos/{UID}/...`; solo el propietario puede cargarla o eliminarla. Tras la aprobación, los usuarios autenticados pueden leer la foto de ese negocio aprobado, sin exponer las fotos de solicitudes pendientes.

El backend expone `POST /api/business-requests` (también `POST /business-requests`). El cliente envía únicamente `requestId` y el token de sesión. El servidor valida el JWT con Supabase y lee la fila usando ese mismo token para conservar RLS; no acepta los datos del negocio enviados por el cliente. La solicitud debe pertenecer al usuario autenticado y seguir `pendiente`. El endpoint limita a tres avisos por usuario cada diez minutos y envía a soporte los datos guardados, el enlace temporal a la foto y un enlace a Google Maps.

El correo incluye **Aprobar negocio** y **Rechazar solicitud**. Los enlaces están firmados con HMAC-SHA256 y vencen en siete días. Al abrirlos, el servidor solo muestra una página de confirmación; el cambio ocurre únicamente al confirmar mediante POST. El POST valida la firma y actualiza la fila de forma condicional solo si continúa `pendiente`. Al aprobar, el trigger crea o actualiza el negocio y asocia sus publicaciones a `business_id`; al rechazar, se guarda un motivo estándar de revisión. El trigger establece `reviewed_at`. Al volver a abrir la app, el cliente ve el aviso de aprobación y puede cambiar de modo desde Perfil. No se envían SMS ni correos al negocio.

Configura en el entorno privado del backend estas variables, también listadas en `.env.example`:

- `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` para validar la sesión y leer la solicitud con RLS.
- `SUPABASE_SERVICE_ROLE_KEY` para consultar la solicitud durante la confirmación y realizar el cambio de estado. Esta clave se lee solo en el servidor; nunca la incluyas en la app, en variables `EXPO_PUBLIC_` ni en logs.
- `PUBLIC_API_URL` con la URL HTTPS pública del backend, sin ruta adicional.
- `APPROVAL_SECRET` con un valor aleatorio privado de al menos 32 bytes. Puedes generarlo con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Guárdalo únicamente en el entorno del servidor.
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` y `SUPPORT_EMAIL` para el correo de soporte. El dominio remitente debe estar verificado en Resend para producción.

En Render, configura las variables anteriores en **Environment**; `render.yaml` las declara como valores que deben suministrarse de forma privada. No guardes los valores reales en el repositorio. La publishable key permite validar la sesión del usuario, pero la lectura de la solicitud se realiza con su token y aplica RLS. La clave de servicio se usa únicamente en las rutas de revisión firmada y no se devuelve al cliente.

Prueba el flujo con una solicitud de desarrollo: comprueba que el correo incluya los datos, la foto y Google Maps; abre cada enlace y verifica que el GET no modifique la base; confirma una acción y comprueba que la solicitud deje de estar pendiente, tenga `reviewed_at` y que al aprobar el trigger haya creado el negocio. Comprueba también que un enlace vencido o modificado no permita cambios, y que volver a confirmar una solicitud revisada no la actualice de nuevo.

## Enviar comentarios a Soporte

La pantalla de Soporte envía los comentarios a `POST /api/support` en el backend Node existente. Clientes y vendedores envían tipo, nombre, teléfono salvadoreño de 8 dígitos y comentario. El servidor valida los datos y envía un correo a `soportenokory@gmail.com`. Para pruebas locales puede usar Nodemailer con Gmail; para Render Free usa la API HTTPS de Resend, porque Render Free bloquea el SMTP saliente.

1. Copia `.env.example` a `.env`. Mantén `.env` fuera del control de versiones y nunca uses `EXPO_PUBLIC_` en las credenciales del correo.
2. Para pruebas locales con Gmail, configura `GMAIL_USER=soportenokory@gmail.com`, `GMAIL_APP_PASSWORD` con una contraseña de aplicación de Google y `SUPPORT_EMAIL=soportenokory@gmail.com`. La contraseña de aplicación va solo en el `.env` local del servidor, no en la APK.
3. En Google, activa la verificación en dos pasos y crea una contraseña de aplicación desde **Cuenta de Google → Seguridad → Contraseñas de aplicaciones**. Usa esa clave, no la contraseña normal de Gmail.
4. Para Expo Go en el mismo Wi-Fi, configura `EXPO_PUBLIC_BACKEND_URL=http://<IP_LOCAL_DE_LA_COMPUTADORA>:4000`. Para web en la computadora, `http://localhost:4000` sirve localmente. Estas direcciones no sirven desde otra red.
5. Inicia el servidor local con `npm run api` y Expo con `npx expo start -c`. Prueba con una sesión cliente y otra vendedora y confirma que el comentario llegue a la bandeja de soporte.

El servidor limita cada dirección IP a tres envíos cada diez minutos y la pantalla aplica una espera de treinta segundos después de un envío exitoso. Si el correo no se puede enviar, el formulario conserva los datos y muestra un error.

### Usar soporte desde cualquier red (Render)

La IP `192.168.x.x` solo sirve en la red local. Para que los usuarios envíen comentarios desde cualquier red, publica el backend en un servicio web público. El archivo `render.yaml` ya define el servicio `nokory-support-api`, el puerto y la ruta de salud; Render asigna una URL HTTPS pública. `backend/package.json` mantiene separadas las dependencias del servidor para que el despliegue no instale los paquetes de Expo. La app seguirá usando Supabase para productos y reservas; Render aloja el endpoint de soporte.

1. Crea una cuenta en Resend usando `soportenokory@gmail.com` y genera una clave API de envío. Con el remitente de prueba `onboarding@resend.dev`, el destinatario debe coincidir con el correo de la cuenta Resend. Si más adelante quieres enviar desde un dominio propio, tendrás que verificarlo y configurar `RESEND_FROM_EMAIL`.
2. Confirma que el proyecto actualizado esté subido a una rama de GitHub que puedas conectar con Render. No subas `.env`; está ignorado por Git.
3. En Render elige **New → Blueprint**, conecta el repositorio de Nokory y selecciona la rama. Render leerá `render.yaml` y creará el backend. Agrega `RESEND_API_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` y `APPROVAL_SECRET` en las variables del servicio; `SUPPORT_EMAIL` ya se configura con el buzón de soporte. Genera `APPROVAL_SECRET` como se indica arriba. No guardes claves en GitHub ni en la APK.
4. Espera que el despliegue termine correctamente. Copia la URL pública `https://...onrender.com` que Render asignó al servicio y configúrala como `PUBLIC_API_URL` en Render, sin ruta adicional. Verifica que al abrir `https://...onrender.com/api/health` responda `{"status":"ok"}` y vuelve a desplegar si Render lo solicita.
5. En el `.env` local de la aplicación configura `EXPO_PUBLIC_BACKEND_URL=https://...onrender.com` con la URL real, sin añadir `/api/support`. Reinicia Expo con `npx expo start -c` para probar en Expo Go.
6. Para una APK, genera una APK nueva después de cambiar `EXPO_PUBLIC_BACKEND_URL`; esa URL queda incorporada en la aplicación. `RESEND_API_KEY` permanece únicamente en las variables privadas del servicio Render.

Render Free puede suspender el servicio después de 15 minutos sin tráfico y tardar alrededor de un minuto en despertar. Si necesitas respuesta inmediata siempre, hará falta un plan de hosting activo de pago. No selecciones un plan con costo sin revisar y aceptar su precio.
