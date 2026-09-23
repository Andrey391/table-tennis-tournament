import type { Lang } from "../i18n";

// The privacy policy and the terms of use. They live here rather than in the i18n
// dictionary because they are documents, not interface copy: long, sectioned, and
// versioned as a whole. LEGAL_VERSION must match CONSENT_VERSION in
// server/src/shared/privacy.ts — the server records it as the text each person
// agreed to — so change both together whenever the text changes.
export const LEGAL_VERSION = "2026-09-23";

// Who runs the service. Set these at build time (VITE_LEGAL_*) — until then the
// documents show a bracketed placeholder, which is deliberate: a policy naming no
// operator is not a valid policy, and it should look unfinished, not plausible.
const env = import.meta.env;
const OPERATOR: Record<Lang, Record<string, string>> = {
  ru: {
    operator: env.VITE_LEGAL_OPERATOR || "[наименование оператора, ИНН/ОГРН]",
    address: env.VITE_LEGAL_ADDRESS || "[адрес оператора]",
    email: env.VITE_LEGAL_EMAIL || "[эл. почта для обращений]",
    hosting: env.VITE_LEGAL_HOSTING || "[хостинг-провайдер и страна размещения серверов]",
  },
  en: {
    operator: env.VITE_LEGAL_OPERATOR || "[operator name and registration number]",
    address: env.VITE_LEGAL_ADDRESS || "[operator address]",
    email: env.VITE_LEGAL_EMAIL || "[contact email]",
    hosting: env.VITE_LEGAL_HOSTING || "[hosting provider and server location]",
  },
};

export type LegalDoc = { title: string; sections: { h: string; p: string[] }[] };
export type LegalKind = "privacy" | "terms";

const DOCS: Record<Lang, Record<LegalKind, LegalDoc>> = {
  ru: {
    privacy: {
      title: "Политика обработки персональных данных",
      sections: [
        { h: "1. Общие положения", p: [
          "Политика составлена в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных» и описывает, какие данные пользователей обрабатывает сервис для организации любительских турниров по настольному теннису (далее — Сервис), зачем и как.",
          "Оператор персональных данных: {operator}, адрес: {address}. Обращения по вопросам персональных данных: {email}.",
          "Регистрируясь, пользователь подтверждает, что ознакомился с Политикой и даёт согласие на обработку своих данных на её условиях.",
        ] },
        { h: "2. Какие данные обрабатываются", p: [
          "При регистрации: имя, фамилия, адрес электронной почты, пароль (хранится только в виде необратимого хеша), по желанию — город и клуб.",
          "По желанию пользователя в профиле: телефон и дата рождения. Эти данные не показываются другим пользователям.",
          "При использовании Сервиса: участие в турнирах и играх, результаты матчей и партий, рейтинг и его изменения, сообщения в чатах турниров, бронирования столов, подписки на клубы, уведомления.",
          "Технические данные: IP-адрес используется для защиты от перебора паролей и в базе данных не сохраняется. В браузере хранятся токен входа, выбранный язык и город — это необходимо для работы Сервиса, рекламных и аналитических cookie нет.",
        ] },
        { h: "3. Цели и основания обработки", p: [
          "Цели: регистрация и вход; проведение турниров и игр (составы, пары, счёт, таблицы); расчёт рейтинга; бронирование столов в клубах; уведомления внутри Сервиса; обеспечение безопасности.",
          "Основания: согласие пользователя (п. 1 ч. 1 ст. 6 152-ФЗ) и исполнение пользовательского соглашения, стороной которого является пользователь (п. 5 ч. 1 ст. 6 152-ФЗ).",
        ] },
        { h: "4. Что видят другие", p: [
          "Имя, фамилия, город, клуб, рейтинг и результаты матчей показываются всем посетителям Сервиса, в том числе без входа (рейтинг, результаты, публичные страницы турниров), только если пользователь дал на это отдельное согласие (ст. 10.1 152-ФЗ). Согласие можно дать или отозвать в любой момент в профиле, раздел «Настройки».",
          "Без такого согласия пользователь не попадает в общий рейтинг и таблицы лидеров, а посетители без входа видят вместо его имени «Скрытый игрок». Зарегистрированные пользователи видят имя соперника в турнирах, где они участвуют, — без этого провести турнир невозможно.",
          "Организатор турнира видит состав и заявки своего турнира. Клуб видит бронирования своих столов. Эл. почта, телефон и дата рождения другим пользователям не показываются.",
        ] },
        { h: "5. Передача третьим лицам", p: [
          "Оператор не продаёт и не передаёт персональные данные третьим лицам, кроме случаев, предусмотренных законом.",
          "Данные хранятся у хостинг-провайдера: {hosting}. Провайдер обрабатывает их только для хранения по поручению оператора.",
        ] },
        { h: "6. Сроки хранения", p: [
          "Данные хранятся, пока существует аккаунт. Уведомления удаляются через 60 дней, демо-аккаунты — через 24 часа, если их не сохранили.",
          "При удалении аккаунта удаляются имя, эл. почта, телефон, дата рождения, город, клуб, сообщения, подписки, уведомления и незавершённые заявки. Сыгранные матчи остаются в обезличенном виде («Удалённый игрок»), потому что входят в турнирные таблицы и рейтинги других участников.",
        ] },
        { h: "7. Права пользователя", p: [
          "Пользователь вправе получить сведения об обработке своих данных, уточнить их (редактирование профиля), отозвать согласие и потребовать удаления (кнопка «Удалить аккаунт» в профиле или обращение на {email}). Ответ на обращение даётся в течение 10 рабочих дней.",
          "Пользователь вправе обжаловать действия оператора в Роскомнадзоре или в суде.",
        ] },
        { h: "8. Защита данных", p: [
          "Пароли хранятся только в виде хеша, данные передаются по защищённому соединению, доступ к ним ограничен, контактные данные не отдаются в публичных запросах.",
        ] },
        { h: "9. Несовершеннолетние", p: [
          "Сервис предназначен для лиц старше 14 лет. Регистрация ребёнка младше 14 лет допускается только его законным представителем и с его согласия.",
        ] },
        { h: "10. Изменения", p: [
          "Редакция от {version}. При изменении Политики новая редакция публикуется на этой странице; версия, с которой согласился пользователь, сохраняется.",
        ] },
      ],
    },
    terms: {
      title: "Пользовательское соглашение",
      sections: [
        { h: "1. Предмет", p: [
          "Соглашение заключается между {operator} (далее — Оператор) и пользователем Сервиса для организации любительских турниров по настольному теннису. Сервис предоставляется бесплатно.",
          "Регистрация означает принятие Соглашения и Политики обработки персональных данных.",
        ] },
        { h: "2. Аккаунт", p: [
          "Пользователь указывает достоверные имя и фамилию, отвечает за сохранность пароля и за действия, совершённые под его аккаунтом. Сервис предназначен для лиц старше 14 лет.",
          "Пользователь может удалить аккаунт в профиле в любой момент.",
        ] },
        { h: "3. Правила поведения", p: [
          "Запрещено: публиковать оскорбления, угрозы, спам, незаконный контент и чужие персональные данные; выдавать себя за другого человека; вносить заведомо ложные результаты матчей; пытаться нарушить работу Сервиса.",
          "Оператор вправе удалить контент, нарушающий Соглашение или закон, и ограничить доступ нарушителю.",
        ] },
        { h: "4. Рейтинг", p: [
          "Рейтинг Сервиса — внутренний и неофициальный. Он рассчитывается по формуле, аналогичной опубликованной Федерацией настольного тенниса России, но не является рейтингом ФНТР, и Сервис с ФНТР не связан.",
        ] },
        { h: "5. Бронирование столов", p: [
          "Бронирование — это запись о намерении прийти в клуб. Цену и условия отмены устанавливает клуб; Оператор не является стороной договора между пользователем и клубом.",
          "Если онлайн-оплата не подключена, бронирование оплачивается в клубе. Отметка «Оплачено» ставится только после подтверждения платежа платёжным провайдером.",
        ] },
        { h: "6. Контент пользователя", p: [
          "Размещая сообщения, названия турниров и сведения о клубах, пользователь подтверждает, что имеет на это право, и разрешает Оператору показывать их в Сервисе.",
        ] },
        { h: "7. Ответственность", p: [
          "Сервис предоставляется «как есть». Оператор не отвечает за проведение турниров и игр, за состояние клубов и инвентаря, за вред здоровью во время игры, а также за перерывы в работе Сервиса.",
        ] },
        { h: "8. Изменения и контакты", p: [
          "Редакция от {version}. Оператор может изменять Соглашение, публикуя новую редакцию на этой странице. Вопросы и претензии: {email}.",
        ] },
      ],
    },
  },
  en: {
    privacy: {
      title: "Personal Data Policy",
      sections: [
        { h: "1. General", p: [
          "This policy follows Russian Federal Law No. 152-FZ \"On Personal Data\" and describes which personal data the table tennis club tournament service (the Service) processes, why and how.",
          "Data operator: {operator}, address: {address}. Personal data requests: {email}.",
          "By signing up the user confirms they have read this policy and consent to the processing of their data on its terms.",
        ] },
        { h: "2. Data processed", p: [
          "At signup: first and last name, email, password (stored only as an irreversible hash), optionally city and club.",
          "Optionally in the profile: phone and date of birth. These are never shown to other users.",
          "While using the Service: tournament and game participation, match and set results, rating and its changes, tournament chat messages, table bookings, club follows, notifications.",
          "Technical data: the IP address is used to protect against password guessing and is not stored in the database. The browser keeps the sign-in token, the chosen language and city, which the Service needs to work; there are no advertising or analytics cookies.",
        ] },
        { h: "3. Purposes and legal grounds", p: [
          "Purposes: signing up and in; running tournaments and games (rosters, pairings, scores, standings); computing the rating; booking tables at clubs; in-app notifications; security.",
          "Grounds: the user's consent (152-FZ art. 6(1)(1)) and performance of the terms of use the user is a party to (art. 6(1)(5)).",
        ] },
        { h: "4. What others see", p: [
          "Name, city, club, rating and match results are shown to every visitor, including those not signed in (rating, results, public tournament pages), only if the user gave a separate consent to that (152-FZ art. 10.1). It can be given or withdrawn at any time under Profile, Settings.",
          "Without it the user is left out of the public rating and leaderboards, and visitors who are not signed in see \"Hidden player\" instead of their name. Signed-in users see their opponents' names in tournaments they take part in, without which a tournament cannot be run.",
          "A tournament organiser sees their tournament's roster and requests. A club sees bookings of its tables. Email, phone and date of birth are never shown to other users.",
        ] },
        { h: "5. Third parties", p: [
          "The operator does not sell or share personal data with third parties except where the law requires it.",
          "Data is stored with the hosting provider: {hosting}, which processes it only to store it on the operator's behalf.",
        ] },
        { h: "6. Retention", p: [
          "Data is kept while the account exists. Notifications are deleted after 60 days, unclaimed demo accounts after 24 hours.",
          "Deleting the account removes the name, email, phone, date of birth, city, club, messages, follows, notifications and pending requests. Played matches remain anonymised (\"Deleted player\"), as they are part of other players' standings and ratings.",
        ] },
        { h: "7. User rights", p: [
          "The user may request information about the processing of their data, correct it (profile editing), withdraw consent and demand deletion (the Delete account button in the profile, or a request to {email}). Requests are answered within 10 working days.",
          "The user may complain to Roskomnadzor or a court.",
        ] },
        { h: "8. Security", p: [
          "Passwords are stored only as hashes, data travels over an encrypted connection, access to it is restricted, and contact details are never returned by public requests.",
        ] },
        { h: "9. Minors", p: [
          "The Service is intended for users over 14. A child under 14 may only be registered by, and with the consent of, their legal guardian.",
        ] },
        { h: "10. Changes", p: [
          "Version of {version}. A changed policy is published on this page; the version each user agreed to is recorded.",
        ] },
      ],
    },
    terms: {
      title: "Terms of Use",
      sections: [
        { h: "1. Subject", p: [
          "These terms are agreed between {operator} (the Operator) and the user of the Service for running amateur table tennis tournaments. The Service is free of charge.",
          "Signing up means accepting these terms and the Personal Data Policy.",
        ] },
        { h: "2. Account", p: [
          "The user gives their real first and last name, keeps their password safe and is responsible for actions taken under their account. The Service is intended for users over 14.",
          "The user can delete their account from the profile at any time.",
        ] },
        { h: "3. Conduct", p: [
          "Not allowed: insults, threats, spam, unlawful content and other people's personal data; impersonating someone; entering knowingly false match results; attempting to disrupt the Service.",
          "The Operator may remove content that breaks these terms or the law and restrict the offender's access.",
        ] },
        { h: "4. Rating", p: [
          "The Service's rating is internal and unofficial. It uses a formula similar to the one published by the Table Tennis Federation of Russia, but it is not an FNTR rating and the Service is not affiliated with the FNTR.",
        ] },
        { h: "5. Table bookings", p: [
          "A booking records an intention to come to a club. The club sets the price and the cancellation terms; the Operator is not a party to the agreement between the user and the club.",
          "Unless online payment is enabled, a booking is paid at the club. A booking is marked Paid only once a payment provider confirms the payment.",
        ] },
        { h: "6. User content", p: [
          "By posting messages, tournament names and club details the user confirms they have the right to do so and allows the Operator to show them in the Service.",
        ] },
        { h: "7. Liability", p: [
          "The Service is provided as is. The Operator is not responsible for how tournaments and games are run, for the condition of clubs and equipment, for injuries during play, or for interruptions of the Service.",
        ] },
        { h: "8. Changes and contact", p: [
          "Version of {version}. The Operator may change these terms by publishing a new version on this page. Questions and claims: {email}.",
        ] },
      ],
    },
  },
};

export function legalDoc(kind: LegalKind, lang: Lang): LegalDoc {
  const vars: Record<string, string> = { ...OPERATOR[lang], version: LEGAL_VERSION };
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
  const doc = DOCS[lang][kind];
  return { title: doc.title, sections: doc.sections.map(s => ({ h: s.h, p: s.p.map(fill) })) };
}
