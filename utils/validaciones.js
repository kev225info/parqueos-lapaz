export const esEmail = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export const normalizar = (t = '') =>
    String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

export const aNumero = (v) => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

export const esHora = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v);
export const completarHora = (v) => (v.length === 5 ? `${v}:00` : v);

export const TIPOS_PARQUEO = ['publico', 'privado'];

// Hora actual de La Paz (UTC-4, sin horario de verano) como 'HH:MM:SS'
export const horaLaPaz = () =>
    new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(new Date());
