export function formatarNumero(n: number): string {
  const inteiro = Math.trunc(n);
  const sinal = inteiro < 0 ? '-' : '';
  return sinal + String(Math.abs(inteiro)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatarDinheiro(n: number): string {
  const inteiro = Math.trunc(n);
  return `${inteiro < 0 ? '-' : ''}$${formatarNumero(Math.abs(inteiro))}`;
}

const FORMATADOR_DATA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatarData(valor: Date | string | number): string {
  const data = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(data.getTime())) return '';
  const p = Object.fromEntries(FORMATADOR_DATA.formatToParts(data).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}
