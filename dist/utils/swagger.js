"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.swaggerSpec = void 0;
const swagger_jsdoc_1 = __importDefault(require("swagger-jsdoc"));
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
exports.swaggerSpec = (0, swagger_jsdoc_1.default)(options);
//# sourceMappingURL=swagger.js.map