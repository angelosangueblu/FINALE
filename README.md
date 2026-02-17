# Monitor automatico prodotti scontati (Playwright + Telegram)

Questo progetto replica il tuo flusso manuale:

1. apre la pagina/categoria
2. refresh periodico (simile a F5)
3. attende caricamento contenuti JS
4. esegue uno script custom (quello che oggi lanci da console)
5. legge prodotti + sconto
6. invia notifica Telegram solo per prodotti **nuovi** e sopra soglia

## Requisiti

- Node.js 18+

## Setup rapido

```bash
npm install
cp config.example.json config.json
cp scripts/extractor.template.js scripts/extractor.js
```

Poi modifica:

- `config.json`
  - URL categoria/e
  - soglia sconto
  - intervallo refresh
  - token/chat Telegram
- `scripts/extractor.js`
  - inserisci/adatta il tuo script da console

## Formato script estrattore

`extractor.js` viene eseguito dentro la pagina e deve restituire un array tipo:

```js
return [
  {
    id: 'id-univoco',
    title: 'Nome prodotto',
    url: 'https://...',
    discount: '75%', // o 75
    createdAt: '2026-01-01 10:30'
  }
];
```

> `id` dovrebbe essere stabile/univoco (id prodotto o URL) per evitare duplicati.

## Avvio

```bash
npm start
```

oppure:

```bash
node src/monitor.js --config ./config.json
```

## Come evita i duplicati

Lo script salva uno storico in `state/seen-products.json`.
Se un prodotto è già stato notificato in passato (stesso `id`/`url`/`title`), non reinvia alert.

## Esecuzione H24

Opzioni consigliate:

- VPS economico Linux + `pm2`
- Docker container
- PC sempre acceso con task scheduler

Esempio con pm2:

```bash
npm i -g pm2
pm2 start src/monitor.js --name discount-monitor -- --config ./config.json
pm2 save
pm2 startup
```

## Notifica Telegram

Il messaggio include:

- monitor/categoria
- titolo prodotto
- percentuale sconto
- link
- data inserimento (se disponibile)

## Prossimo passo per te

Incollami i 3 dati reali e ti preparo config + extractor già pronti:

1. URL categoria
2. script JS attuale da console
3. soglia + intervallo (es. 75% e 30s)
