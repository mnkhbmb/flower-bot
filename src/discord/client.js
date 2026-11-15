import { Client, GatewayIntentBits } from 'discord.js';
import { getWorkerNames } from '../services/sheets.js';

export const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// Ажилтан: өдрөөр тооцох
export const WORKERS = ['Туяа', 'Амина'];
// Захирал: тогтмол хагас сарын цалин
export const DIRECTORS = [
  { name: 'Саруул', amount: 750000 },
  { name: 'Лулу',   amount: 750000 },
];

// Банкны утгаас нэр таних, урьдчилгааг цалингаас хасахад ашиглана
export function salaryPeople() {
  return [...WORKERS, ...DIRECTORS.map(d => d.name)];
}

// Ажилтан сонгох цэсэнд: тогтмол жагсаалт + Ирц дээрх нэрс
export async function allPeople() {
  let names = [];
  try { names = await getWorkerNames(); } catch { /* sheet уншиж чадахгүй бол тогтмол жагсаалт */ }
  return [...new Set([...salaryPeople(), ...names])].slice(0, 25);
}
export const PAY_CATS = ['Цалин', 'Урьдчилгаа'];
