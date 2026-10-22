# FRAITH FUTURAMA — Estructura del ecosistema (propuesta técnica)

Fecha: 2026-10-22
Estado: **plan de integración — sin activar servicios comerciales nuevos**.

## Principios

- Un solo propietario y un solo inventario de componentes.
- Mantener **Capital Command** y **FRAITH BUSINESS PRO** como productos separados bajo la marca FRAITH FUTURAMA; no mezclar finanzas personales con datos de clientes comerciales.
- Conservar los repositorios existentes y utilizar ramas de desarrollo y revisiones antes de fusionar.
- Separar completamente la **web pública** del **panel administrativo** y de la **aplicación comercial**.
- No publicar contraseñas, tokens, API keys, datos reales de clientes ni información de terceros.
- No activar cobros, envío masivo de mensajes o transacciones sin aprobación explícita.

## Inventario verificado

| Componente | Dónde está | Estado observado | Riesgo/prioridad |
|---|---|---|---|
| Portal actual | `/index.html` | Página Capital Command | Debe decidirse portada multiproducto |
| API actual | `/server/main.py` | FastAPI Capital Command | Proteger exposición estática y ejecución de agentes |
| Agentes actuales | `/server/agents.py` | Especialistas orientados a inversiones | No son agentes de ventas ni un equipo autónomo de desarrollo |
| Catálogo público Business Pro | `/fraith-business-pro/index.html` | Landing informativa | Sin login, sin datos de clientes; correcta como presentación |
| Prototipo de gestión | Archivo histórico entregado fuera del repo | Demostración local con localStorage | No apto para producción multiempresa |

## Arquitectura destino

```text
FRAITH FUTURAMA (portal general y gobierno)
├─ Catálogo público (solo marketing; sin credenciales)
├─ FRAITH BUSINESS PRO (futuro SaaS multiempresa)
│  ├─ Web y aplicación móvil instalable (PWA primero)
│  ├─ API comercial autenticada
│  ├─ Base de datos empresarial con aislamiento por tenant
│  ├─ Ventas + inventario + gastos + clientes
│  └─ Asistente FRAITH (futuro; controlado y con límites)
├─ Capital Command (finanzas/inversiones, separado del negocio)
└─ Panel de control de propietario (identidad + MFA + auditoría)
```

## Equipo lógico por responsabilidades

- Dirección de producto: priorización, versiones, comunicación con propietario.
- Arquitectura de software: interfaces, contratos API, base de datos, cambios revisados.
- Ciberseguridad: autenticación, permisos, aislamiento de comercios, gestión de secretos.
- Calidad: pruebas unitarias, integración, accesibilidad y validación móvil.
- Comunicación: catálogo y contenido; **no** publicidad engañosa de funciones en desarrollo.

Estos son **roles de trabajo**. No equivalen a agentes autónomos corriendo en segundo plano.

## Reglas de seguridad, mínimo para piloto real

1. Modelo multiempresa con `tenant_id` aplicado y validado en servidor para cada acceso.
2. Contraseñas protegidas mediante proveedor de identidad, MFA de administrador, sesiones seguras y revocables.
3. Archivos del servidor no accesibles desde la carpeta pública; registros y secretos fuera del frontend.
4. Endpoints que consumen API/IA protegidos con autenticación, autorización, cuotas y presupuesto.
5. TLS, respaldos cifrados, pruebas de restauración, registro de eventos y gestión de incidentes.
6. CI con pruebas, análisis de dependencias y verificación de secretos; revisión antes de fusionar a `main`.
7. Referencia: OWASP ASVS 5.0.0 y MASVS para aplicación móvil; los controles deben verificarse, nunca presumirse.

## Prioridades de entrega

**Fase 0 — Inventario y contención**: documentar código actual, separar marketing/backend, proteger archivos y endpoints costosos, revisar accesibilidad del sitio publicado.

**Fase 1 — Producto Business Pro seguro**: cuentas de prueba, comercios separados, ventas e inventario, reportes, pruebas automatizadas de permisos. Sin datos de clientes reales.

**Fase 2 — Piloto controlado**: controles de autenticación, MFA, copias de seguridad, monitoreo, políticas de privacidad, revisión de seguridad y aceptación del propietario.

**Fase 3 — App Android/PWA**: experiencia instalable, offline limitado con sincronización segura, documentación, distribución controlada y eventual publicación.

## Límites de ejecución

La rama `seguridad-y-ecosistema-fraith-2026` es de preparación. Ningún cambio se considera en producción hasta que haya revisión, pruebas y aprobación de fusión/despliegue. GitHub Pages no aloja por sí solo una API FastAPI ni una base de datos multiempresa.
