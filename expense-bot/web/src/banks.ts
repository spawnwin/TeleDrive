export type Bank = {
  id: string
  name: string
  short: string
  color: string
  /** monochrome mark on brand color */
  mark: string
}

/** Major Russian banks for mortgages & deposits */
export const BANKS: Bank[] = [
  { id: 'sber', name: 'Сбербанк', short: 'Сбер', color: '#21A038', mark: 'С' },
  { id: 'vtb', name: 'ВТБ', short: 'ВТБ', color: '#009FDF', mark: 'В' },
  { id: 'alfa', name: 'Альфа-Банк', short: 'Альфа', color: '#EF3124', mark: 'α' },
  { id: 'tbank', name: 'Т-Банк', short: 'Т-Банк', color: '#FFDD2D', mark: 'T' },
  { id: 'gpb', name: 'Газпромбанк', short: 'ГПБ', color: '#1F4E79', mark: 'Г' },
  { id: 'rshb', name: 'Россельхозбанк', short: 'РСХБ', color: '#1B7A3D', mark: 'Р' },
  { id: 'sovcom', name: 'Совкомбанк', short: 'Совком', color: '#C8102E', mark: 'СК' },
  { id: 'psb', name: 'ПСБ', short: 'ПСБ', color: '#2E5AAC', mark: 'П' },
  { id: 'mkb', name: 'МКБ', short: 'МКБ', color: '#E30613', mark: 'М' },
  { id: 'raif', name: 'Райффайзенбанк', short: 'Райф', color: '#FFE600', mark: 'R' },
  { id: 'rosbank', name: 'Росбанк', short: 'Росбанк', color: '#E30613', mark: 'РБ' },
  { id: 'otkritie', name: 'Открытие', short: 'Открытие', color: '#00AEEF', mark: 'О' },
  { id: 'pochta', name: 'Почта Банк', short: 'Почта', color: '#0047BB', mark: '✉' },
  { id: 'bspb', name: 'Банк Санкт-Петербург', short: 'БСПБ', color: '#003399', mark: 'СП' },
  { id: 'uralsib', name: 'Уралсиб', short: 'Уралсиб', color: '#E31E24', mark: 'У' },
  { id: 'akbars', name: 'Ак Барс', short: 'Ак Барс', color: '#00A651', mark: 'АБ' },
  { id: 'home', name: 'Хоум Банк', short: 'Хоум', color: '#FF6B00', mark: 'Х' },
  { id: 'renessans', name: 'Ренессанс Банк', short: 'Ренессанс', color: '#6B2D5B', mark: 'Р' },
  { id: 'otp', name: 'ОТП Банк', short: 'ОТП', color: '#00A651', mark: 'О' },
  { id: 'sinara', name: 'Синара Банк', short: 'Синара', color: '#E30613', mark: 'С' },
  { id: 'mts', name: 'МТС Банк', short: 'МТС', color: '#E30613', mark: 'М' },
  { id: 'ozon', name: 'Ozon Банк', short: 'Ozon', color: '#005BFF', mark: 'O' },
  { id: 'yandex', name: 'Яндекс Банк', short: 'Яндекс', color: '#FC3F1D', mark: 'Я' },
  { id: 'wb', name: 'Wildberries Банк', short: 'WB', color: '#CB11AB', mark: 'W' },
  { id: 'tochka', name: 'Точка', short: 'Точка', color: '#24B23E', mark: '•' },
  { id: 'modul', name: 'Модульбанк', short: 'Модуль', color: '#6C5CE7', mark: 'М' },
  { id: 'domrf', name: 'Банк ДОМ.РФ', short: 'ДОМ.РФ', color: '#E31E24', mark: 'Д' },
  { id: 'novikom', name: 'Новикомбанк', short: 'Новиком', color: '#0033A0', mark: 'Н' },
  { id: 'absolut', name: 'Абсолют Банк', short: 'Абсолют', color: '#ED1C24', mark: 'А' },
  { id: 'loko', name: 'Локо-Банк', short: 'Локо', color: '#E30613', mark: 'Л' },
  { id: 'avangard', name: 'Авангард', short: 'Авангард', color: '#C8102E', mark: 'А' },
  { id: 'bks', name: 'БКС Банк', short: 'БКС', color: '#FF6600', mark: 'Б' },
  { id: 'expobank', name: 'Экспобанк', short: 'Экспо', color: '#0033A0', mark: 'Э' },
  { id: 'cifra', name: 'Цифра банк', short: 'Цифра', color: '#00C853', mark: 'Ц' },
  { id: 'uni', name: 'ЮниКредит Банк', short: 'ЮниКредит', color: '#E2001A', mark: 'U' },
  { id: 'ingos', name: 'Ингосстрах Банк', short: 'Ингос', color: '#003399', mark: 'И' },
  { id: 'centr', name: 'Центр-инвест', short: 'Центр', color: '#E31E24', mark: 'Ц' },
  { id: 'kuban', name: 'Кубань Кредит', short: 'Кубань', color: '#FFD700', mark: 'К' },
  { id: 'metal', name: 'Металлинвестбанк', short: 'Металл', color: '#1A1A2E', mark: 'М' },
  { id: 'solid', name: 'Солид Банк', short: 'Солид', color: '#0066B3', mark: 'С' },
]

export const OTHER_BANK_ID = 'other'

const BANK_ALIASES: Record<string, string> = {
  сбер: 'sber',
  сбербанк: 'sber',
  sber: 'sber',
  sberbank: 'sber',
  втб: 'vtb',
  vtb: 'vtb',
  альфа: 'alfa',
  'альфа-банк': 'alfa',
  'альфа банк': 'alfa',
  alfa: 'alfa',
  alfabank: 'alfa',
  'т-банк': 'tbank',
  'т банк': 'tbank',
  тинькофф: 'tbank',
  tinkoff: 'tbank',
  tbank: 'tbank',
  газпромбанк: 'gpb',
  гпб: 'gpb',
  gazprombank: 'gpb',
  россельхозбанк: 'rshb',
  рсхб: 'rshb',
  совкомбанк: 'sovcom',
  совком: 'sovcom',
  псб: 'psb',
  промсвязьбанк: 'psb',
  мкб: 'mkb',
  райффайзен: 'raif',
  райффайзенбанк: 'raif',
  райф: 'raif',
  росбанк: 'rosbank',
  открытие: 'otkritie',
  'почта банк': 'pochta',
  почта: 'pochta',
  бспб: 'bspb',
  'банк санкт-петербург': 'bspb',
  уралсиб: 'uralsib',
  'ак барс': 'akbars',
  'ак барс банк': 'akbars',
  'хоум банк': 'home',
  хоум: 'home',
  ренессанс: 'renessans',
  'ренессанс банк': 'renessans',
  отп: 'otp',
  'отп банк': 'otp',
  синара: 'sinara',
  'мтс банк': 'mts',
  мтс: 'mts',
  ozon: 'ozon',
  'ozon банк': 'ozon',
  озон: 'ozon',
  яндекс: 'yandex',
  'яндекс банк': 'yandex',
  wildberries: 'wb',
  wb: 'wb',
  вайлдберриз: 'wb',
  точка: 'tochka',
  модульбанк: 'modul',
  модуль: 'modul',
  'дом.рф': 'domrf',
  'банк дом.рф': 'domrf',
  донрф: 'domrf',
  новикомбанк: 'novikom',
  новиком: 'novikom',
  абсолют: 'absolut',
  'абсолют банк': 'absolut',
  локо: 'loko',
  'локо-банк': 'loko',
  авангард: 'avangard',
  бкс: 'bks',
  'бкс банк': 'bks',
  экспобанк: 'expobank',
  экспо: 'expobank',
  цифра: 'cifra',
  'цифра банк': 'cifra',
  юникредит: 'uni',
  'юникредит банк': 'uni',
  ингос: 'ingos',
  'ингосстрах банк': 'ingos',
  'центр-инвест': 'centr',
  'кубань кредит': 'kuban',
  металлинвестбанк: 'metal',
  металл: 'metal',
  солид: 'solid',
  'солид банк': 'solid',
}

export function findBankByName(name: string): Bank | null {
  const n = name.trim().toLowerCase()
  if (!n) return null
  const byAlias = BANK_ALIASES[n]
  if (byAlias) return BANKS.find((b) => b.id === byAlias) ?? null
  return (
    BANKS.find(
      (b) =>
        b.name.toLowerCase() === n ||
        b.short.toLowerCase() === n ||
        b.id === n,
    ) ?? null
  )
}

export function bankDisplayName(stored: string): string {
  return findBankByName(stored)?.name ?? stored
}

export function isDarkBankColor(hex: string): boolean {
  const h = hex.replace('#', '')
  if (h.length !== 6) return true
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 < 160
}
