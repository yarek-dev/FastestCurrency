alter table public.paid_services
    add column guidance_key text unique,
    drop constraint paid_services_kind_check,
    add constraint paid_services_kind_check
        check (kind in ('tariff', 'booking_rule', 'payment_rule', 'availability_rule'));

-- Reuse the matching catalog entries in databases that already have the imported tariffs.
update public.paid_services set guidance_key = 'maternity_individual'
where id = (
    select id from public.paid_services
    where kind = 'tariff' and title = 'Индивидуальное ведение родов'
        and audience = 'belarus_citizens_or_residents' and price_type = 'fixed' and amount = 308.14
    order by id limit 1
);

update public.paid_services set guidance_key = 'maternity_consultation'
where id = (
    select id from public.paid_services
    where kind = 'tariff' and title = 'Консультация врача-специалиста, кандидата медицинских наук хирургического профиля'
        and audience = 'not_stated' and price_type = 'fixed' and amount = 37.92
    order by id limit 1
);

insert into public.paid_services (guidance_key, kind, section, audience, title, body, unit, price_type, amount)
values
    ('belarus_paid_diagnostics', 'availability_rule', 'Диагностика', 'belarus_citizens',
     'Платная диагностика и анализы для граждан Республики Беларусь',
     'Медцентр не оказывает гражданам Республики Беларусь платные услуги лучевой диагностики (КТ, МРТ, рентген), УЗИ и лабораторные анализы. Условия бесплатного обследования взрослых в этом правиле не указаны.',
     null, null, null),
    ('belarus_child_paid_services', 'availability_rule', 'Педиатрия', 'belarus_citizens',
     'Медицинские услуги для детей с гражданством Республики Беларусь',
     'Детям с гражданством Республики Беларусь платные медицинские услуги не оказываются. Медицинская помощь таким детям оказывается бесплатно только по направлению.',
     null, null, null),
    -- https://medcenter.by/platnye-uslugi/individualnoe-vedenie-rodov/
    ('maternity_individual', 'tariff', 'Акушерство и гинекология', 'belarus_citizens_or_residents',
     'Индивидуальное ведение родов',
     'Индивидуальное ведение естественных родов для гражданок Республики Беларусь и иностранок с видом на жительство. Консультация врача указана в прейскуранте отдельно.',
     'роды', 'fixed', 308.14),
    ('maternity_consultation', 'tariff', 'Акушерство и гинекология', 'belarus_citizens_or_residents',
     'Консультация врача перед оформлением договора на индивидуальное ведение родов',
     'Отдельная строка прейскуранта на индивидуальное ведение родов: консультация врача-специалиста, кандидата медицинских наук хирургического профиля.',
     'консультация', 'fixed', 37.92),
    ('maternity_contract', 'availability_rule', 'Акушерство и гинекология', null,
     'Договор на естественные роды и кесарево сечение',
     'Для гражданок Республики Беларусь платный договор на индивидуальное ведение родов заключают только на естественные роды. Договор на платное кесарево сечение для гражданок РБ не оформляют. Необходимость операции определяют врачи по медицинским показаниям. Для иностранных гражданок есть программы естественных родов и кесарева сечения.',
     null, null, null),
    ('maternity_booking', 'booking_rule', 'Акушерство и гинекология', null,
     'Запись на платные роды и оформление договора',
     'Запись на сроке беременности 34–36 недель по телефону кабинета платных услуг +375 17 323 52 15. Для оформления договора нужны паспорт, обменная карта и деньги для оплаты. Для гражданок РБ запись по договору доступна на естественные роды, для иностранок — на естественные роды и на кесарево сечение.',
     null, null, null),
    -- https://medcenter.by/medicinskie-uslugi/platnye-medicinskie-uslugi-okazyvaemye-inostrannym-grazhdanam-jeksport-medicinskih-uslug/akusherstvo-i-ginekologija/
    ('maternity_foreign_natural', 'tariff', 'Акушерство и гинекология', 'foreign_patients',
     'Программа «Физиологические роды» для иностранных гражданок',
     'Стоимость программы родовспоможения: естественные роды для иностранных гражданок.',
     'программа', 'from', 2000),
    ('maternity_foreign_cesarean', 'tariff', 'Акушерство и гинекология', 'foreign_patients',
     'Программа «Кесарево сечение» для иностранных гражданок',
     'Стоимость программы родовспоможения: кесарево сечение для иностранных гражданок.',
     'программа', 'from', 4500),
    -- https://medcenter.by/platnye-uslugi/jeko/
    ('ivf_booking', 'booking_rule', 'Вспомогательные репродуктивные технологии', null,
     'Запись на консультацию по ЭКО',
     'Отделение вспомогательных репродуктивных технологий записывает на консультацию по экстракорпоральному оплодотворению по телефонам +375 (17) 270-77-38 и +375 (17) 232-01-30.',
     null, null, null)
on conflict (guidance_key) do update set
    kind = excluded.kind,
    section = excluded.section,
    audience = excluded.audience,
    title = excluded.title,
    body = excluded.body,
    unit = excluded.unit,
    price_type = excluded.price_type,
    amount = excluded.amount;
