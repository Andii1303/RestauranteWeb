# Scripts de Base de Datos para Restaurante

Esta carpeta contiene los scripts SQL para crear y mantener la estructura de la base de datos del proyecto.

## Estructura sugerida
- `schema.sql`: Crea la base de datos y las tablas principales.
- `triggers/`: Aquí van los triggers (uno por archivo, opcional).
- `procedures/`: Aquí van los procedimientos almacenados (uno por archivo, opcional).
- `seed/`: Datos de ejemplo o iniciales.

## Uso rápido
Para inicializar la base de datos desde cero:

```sql
-- En el cliente MySQL:
SOURCE db/schema.sql;
```

O desde el contenedor Docker:

```sh
docker exec -i backwebapp-db-1 mysql -uappuser -pApp12345! < db/schema.sql
```

## Notas
- El backend también puede crear la tabla `app_users` automáticamente si no existe.
- Versiona aquí cualquier cambio estructural importante para mantener el control del esquema.
