"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapPosition = mapPosition;
const POSITION_MAP = {
    // Atacantes
    striker: "forward",
    forward: "forward",
    "center forward": "forward",
    winger: "forward",
    "left winger": "forward",
    "right winger": "forward",
    "second striker": "forward",
    // Meio-campistas
    midfielder: "midfielder",
    "central midfielder": "midfielder",
    "attacking midfielder": "midfielder",
    "defensive midfielder": "midfielder",
    "left midfielder": "midfielder",
    "right midfielder": "midfielder",
    // Defensores
    defender: "defender",
    "center back": "defender",
    "left back": "defender",
    "right back": "defender",
    "wing back": "defender",
    "left wing back": "defender",
    "right wing back": "defender",
    // Goleiro
    goalkeeper: "goalkeeper",
    keeper: "goalkeeper",
    gk: "goalkeeper",
};
/**
 * Mapeia a string de posição da API para o enum interno.
 */
function mapPosition(raw) {
    const normalized = raw.toLowerCase().trim();
    return POSITION_MAP[normalized] ?? "midfielder";
}
//# sourceMappingURL=position-mapper.js.map