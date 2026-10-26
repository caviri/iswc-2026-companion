<p align="center"><img src="icons/icon-192.png" width="96" height="96" alt="ISWC 2026 Companion icon"></p>

<h1 align="center">ISWC 2026 Companion</h1>

<p align="center">
An unofficial companion for the 25th International Semantic Web Conference (Bari, 25–29 October 2026).<br>
<strong><a href="https://caviri.github.io/iswc-2026-companion/">Open the app</a></strong> · install it from your browser and it works offline.
</p>

<p align="center">
<img src="screenshots/phone-dark-01-home.png" width="200" alt="Home on a phone: the day, what's happening now, your picks">
<img src="screenshots/phone-dark-02-deck.png" width="200" alt="The deck: swipe right to keep a session, left to skip, up for maybe">
<img src="screenshots/phone-dark-10-sparql.png" width="200" alt="The SPARQL explorer answering a query in the browser">
<img src="screenshots/phone-dark-06-bari.png" width="200" alt="The Bari guide: districts, sights and food with walking times">
</p>

<p align="center">
<img src="screenshots/desktop-dark-08-paper-panel.png" width="820" alt="On a computer: grouped sidebar, Home, and a paper open in a side panel">
</p>

<p align="center">
<img src="screenshots/desktop-light-02-timetable-workshops.png" width="405" alt="The timetable by room, light mode, with the workshops' own programmes">
<img src="screenshots/desktop-dark-04-built-with-rete.png" width="405" alt="Built with rete: how the page works">
</p>

## What it does

- **Swipe through the programme**: keep, skip or maybe every session, paper, poster and demo; take notes.
- **My ISWC**: your own day-by-day timeline with clash warnings and what's on now and next.
- **Timetable** by room, with the workshops' own timed programmes (Sci-K and more).
- **Explore** the topics and clusters of the programme, **browse** and search everything, find rooms on the floor plans.
- **People**: organisers, chairs, speakers and authors with affiliations, links and short bios.
- **Bari**: concerts tonight, sights, food, comics and day trips, with walking times from the venue.
- **SPARQL explorer**: query the whole programme as a knowledge graph, with ready-made examples.
- **Your data stays yours**: picks and notes live in your browser; download or import them as JSON or `.rete`.

## How it works

The whole app is a static page. There is no server, database or API: the programme is one RDF graph file,
`data/iswc26.rete`, and your browser asks it SPARQL questions with the [rete](https://github.com/caviri/rete) engine
compiled to WebAssembly. The vocabulary is published with the app (`data/iswc26-ontology.ttl`, readable in the app
under Ontology).

rete will be shown at the ISWC 2026 Posters & Demos session: **Tuesday 27 October, 19:15–21:00, Plenary**. Come and
talk to us at the demo, and try the playground at [caviri.github.io/rete](https://caviri.github.io/rete/) and
[demo.graphplaza.com](https://demo.graphplaza.com).

## Made by

[Carlos Vivar Ríos](https://github.com/caviri) ([ORCID 0000-0002-8076-2034](https://orcid.org/0000-0002-8076-2034)),
on data gathered from public places: the ISWC 2026 website and the workshops' own websites, Springer and Crossref,
OpenAlex, DBLP, ORCID, Wikidata, Wikipedia (CC BY-SA), ROR, Wikimedia Commons, OpenStreetMap and GitHub. Every image is
openly licensed and credited on the app's Credits page. Not endorsed by the conference organisers.

## This repository

It holds only the built site, generated from a private source repository (`make public`), which leaves out the
personal travel features and refuses to build if any personal travel detail would end up in the files. Every push
to `main` publishes it with GitHub Pages (`.github/workflows/pages.yml`).

The code is under the MIT licence (`LICENSE`); the data and images keep their own licences, listed in the app.
