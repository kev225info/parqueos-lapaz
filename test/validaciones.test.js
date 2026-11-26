import test from 'node:test';
import assert from 'node:assert/strict';
import { esEmail, normalizar, aNumero, esHora, completarHora } from '../utils/validaciones.js';

test('esEmail valida formato (HU-01)', () => {
    assert.equal(esEmail('juan@test.com'), true);
    assert.equal(esEmail('juan@test'), false);
    assert.equal(esEmail('sin-arroba.com'), false);
});
test('normalizar quita tildes y mayúsculas (HU-06)', () => {
    assert.equal(normalizar('  Sopocachí '), 'sopocachi');
    assert.equal(normalizar('Villa Fátima'), 'villa fatima');
});
test('aNumero', () => {
    assert.equal(aNumero('12.5'), 12.5);
    assert.equal(aNumero(''), null);
    assert.equal(aNumero('abc'), null);
});
test('horas HH:MM (HU-15/16)', () => {
    assert.equal(esHora('08:00'), true);
    assert.equal(esHora('25:00'), false);
    assert.equal(completarHora('08:00'), '08:00:00');
});
