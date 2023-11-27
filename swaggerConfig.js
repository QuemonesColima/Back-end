const swaggerJSDoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0", // Especifica la versión de OpenAPI
    info: {
      title: "API de Mi Aplicación",
      version: "1.0.0",
      description: "Documentación de mi API",
    },
  },
  apis: ["./index.js"], // Ruta a los archivos que contienen los comentarios JSDoc
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;
