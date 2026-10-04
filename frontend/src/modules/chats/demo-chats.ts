import type { Chat, Message } from "./types";

function messages(
    entries: Array<[Message["author"], string, string]>,
): Message[] {
    return entries.map(([author, text, time], index) => ({
        id: String(index),
        author,
        text,
        time,
    }));
}

export const demoChats: Chat[] = [
    {
        id: "anna",
        name: "Анна Ковалёва",
        handle: "@anna_kovaleva",
        initials: "АК",
        color: "#e7eafa",
        unread: 2,
        messages: messages([
            [
                "client",
                "Доброе утро! Хочу посмотреть курс евро к доллару.",
                "09:41",
            ],
            [
                "bot",
                "Доброе утро, Анна! Отправьте валютную пару, например EUR USD.",
                "09:41",
            ],
            ["client", "EUR USD", "09:42"],
            ["bot", "1 EUR = 1,17 USD\nИзменение за сутки: +0,24%.", "09:42"],
            ["client", "А если обменять 250 евро?", "09:43"],
            [
                "bot",
                "Введите сумму перед валютной парой: 250 EUR USD.",
                "09:43",
            ],
            ["client", "250 EUR USD", "09:44"],
            [
                "bot",
                "250 EUR ≈ 292,50 USD\nРасчёт по справочному курсу. Курс обмена в вашем банке может отличаться.",
                "09:44",
            ],
            [
                "client",
                "Спасибо! А можно посмотреть, как курс изменился за неделю?",
                "09:45",
            ],
        ]),
    },
    {
        id: "maxim",
        name: "Максим Орлов",
        handle: "@max_orlov",
        initials: "МО",
        color: "#e3eeea",
        unread: 1,
        messages: messages([
            ["client", "Привет! Подскажи курс доллара к рублю.", "09:32"],
            [
                "bot",
                "Здравствуйте! Отправьте USD RUB для просмотра курса.",
                "09:32",
            ],
            ["client", "100 USD RUB", "09:33"],
            [
                "bot",
                "100 USD ≈ 8 120 RUB. Это пример расчёта по справочному курсу.",
                "09:33",
            ],
            ["client", "Понял, спасибо за расчёт 👍", "09:34"],
        ]),
    },
    {
        id: "daria",
        name: "Дарья Соколова",
        handle: "@dasha_s",
        initials: "ДС",
        color: "#f5e7eb",
        unread: 0,
        messages: messages([
            ["client", "EUR BYN", "09:16"],
            [
                "bot",
                "1 EUR ≈ 3,42 BYN. Хотите посмотреть изменение за период?",
                "09:16",
            ],
            ["client", "Да, интересно сравнить с прошлым месяцем.", "09:17"],
            [
                "bot",
                "Выберите период 30 дней под результатом конвертации.",
                "09:17",
            ],
            ["client", "Отлично, всё нашла. Спасибо!", "09:18"],
        ]),
    },
    {
        id: "artem",
        name: "Артём Волков",
        handle: "@artem_v",
        initials: "АВ",
        color: "#f2ecde",
        unread: 0,
        messages: messages([
            ["client", "Какие валюты можно конвертировать?", "08:57"],
            [
                "bot",
                "Можно указать пару валют, например EUR USD или USD BYN. Для расчёта суммы добавьте число в начале.",
                "08:57",
            ],
            ["client", "Попробую с фунтами: GBP EUR", "08:59"],
            ["bot", "1 GBP ≈ 1,15 EUR.", "08:59"],
        ]),
    },
    {
        id: "maria",
        name: "Мария Лебедева",
        handle: "@maria_leb",
        initials: "МЛ",
        color: "#e3edf7",
        unread: 0,
        messages: messages([
            ["client", "Добрый день! 500 EUR USD", "08:42"],
            ["bot", "500 EUR ≈ 585 USD. Расчёт по справочному курсу.", "08:42"],
            ["client", "Спасибо, именно это и нужно было.", "08:43"],
        ]),
    },
    {
        id: "nikita",
        name: "Никита Морозов",
        handle: "@nikita_m",
        initials: "НМ",
        color: "#ede7f5",
        unread: 0,
        messages: messages([
            ["client", "Можно узнать курс биткоина?", "08:20"],
            ["bot", "Для просмотра курса отправьте BTC USD.", "08:20"],
            ["client", "BTC USD", "08:21"],
            [
                "bot",
                "Пример курса: 1 BTC ≈ 95 000 USD. Значение показано для демонстрации переписки.",
                "08:21",
            ],
        ]),
    },
];
