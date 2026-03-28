import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'EDScript API Documentation',
      version: '1.0.0',
      description: 'Documentação dos endpoints de análise esportiva e integração com LLM',
    },
    servers: [
      {
        url: 'http://localhost:3000', // Ajuste para a porta que você usa
      },
    ],
  },
  // Caminho para onde estão as anotações dos endpoints
  apis: ['./src/routes/*.ts', './src/controller/*.ts'], 
};

export const swaggerSpec = swaggerJsdoc(options);