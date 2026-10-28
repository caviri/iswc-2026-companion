// Shared SPARQL (plain 1.1) used by pipeline tests and the app. Multi-valued
// fields are "|"-joined (order not significant; authors/paperIds/organizerIds/chairIds keep source order).
export const Q_SESSIONS = `PREFIX schema: <http://schema.org/>
PREFIX ic: <https://w3id.org/iswc26-companion/>
SELECT ?stableId ?day ?start ?end ?startISO ?endISO ?kind ?title ?roomId ?allRooms ?chairs ?link ?paperIds
       ?description ?speaker ?affiliation ?talkTitle ?website ?bio ?organizers ?slot ?cluster ?speakerId
       ?organizerIds ?chairIds ?descriptionSource ?descriptionUrl ?agendaSource ?agendaUrl ?venue ?venueUrl ?venueGeo ?address
       (GROUP_CONCAT(DISTINCT ?t; separator="|") AS ?topics)
       (GROUP_CONCAT(DISTINCT ?g; separator="|") AS ?terms)
WHERE {
  ?s a schema:Event ; ic:stableId ?stableId ; ic:kind ?k ; schema:name ?title ;
     ic:day ?day ; ic:start ?start ; ic:startISO ?startISO ; ic:end ?end ;
     ic:allRooms ?allRooms ; ic:paperIdsOrdered ?paperIds .
  ?k ic:stableId ?kind .
  OPTIONAL { ?s ic:endISO ?endISO }
  OPTIONAL { ?s schema:location ?r . ?r ic:stableId ?roomId }
  OPTIONAL { ?s ic:chairs ?chairs }
  OPTIONAL { ?s ic:link ?link }
  OPTIONAL { ?s ic:description ?description }
  OPTIONAL { ?s ic:speaker ?speaker }
  OPTIONAL { ?s ic:affiliation ?affiliation }
  OPTIONAL { ?s ic:talkTitle ?talkTitle }
  OPTIONAL { ?s ic:website ?website }
  OPTIONAL { ?s ic:bio ?bio }
  OPTIONAL { ?s ic:organizers ?organizers }
  OPTIONAL { ?s ic:slot ?slot }
  OPTIONAL { ?s schema:about ?tc . ?tc ic:stableId ?t }
  OPTIONAL { ?s schema:mentions ?gc . ?gc ic:stableId ?g }
  OPTIONAL { ?s ic:inCluster ?cc . ?cc ic:stableId ?cluster }
  OPTIONAL { ?s ic:speakerPerson ?sp . ?sp ic:stableId ?speakerId }
  OPTIONAL { ?s ic:organizerIdsOrdered ?organizerIds }
  OPTIONAL { ?s ic:chairIdsOrdered ?chairIds }
  OPTIONAL { ?s ic:descriptionSource ?descriptionSource }
  OPTIONAL { ?s ic:descriptionUrl ?descriptionUrl }
  OPTIONAL { ?s ic:agendaSource ?agendaSource }
  OPTIONAL { ?s ic:agendaUrl ?agendaUrl }
  OPTIONAL { ?s ic:venue ?venue }
  OPTIONAL { ?s ic:venueUrl ?venueUrl }
  OPTIONAL { ?s ic:venueGeo ?venueGeo }
  OPTIONAL { ?s ic:address ?address }
}
GROUP BY ?stableId ?day ?start ?end ?startISO ?endISO ?kind ?title ?roomId ?allRooms ?chairs ?link ?paperIds
         ?description ?speaker ?affiliation ?talkTitle ?website ?bio ?organizers ?slot ?cluster ?speakerId
         ?organizerIds ?chairIds ?descriptionSource ?descriptionUrl ?agendaSource ?agendaUrl ?venue ?venueUrl ?venueGeo ?address
ORDER BY ?startISO ?stableId`;

export const Q_PAPERS = `PREFIX schema: <http://schema.org/>
PREFIX ic: <https://w3id.org/iswc26-companion/>
SELECT ?stableId ?title ?track ?spotlight ?board ?authors ?authorIds ?sessionId ?cluster ?abstract ?abstractSource
       (GROUP_CONCAT(DISTINCT ?t; separator="|") AS ?topics)
       (GROUP_CONCAT(DISTINCT ?l; separator="|") AS ?lists)
       (GROUP_CONCAT(DISTINCT ?g; separator="|") AS ?terms)
WHERE {
  ?p a schema:ScholarlyArticle ; ic:stableId ?stableId ; schema:name ?title ;
     ic:track ?track ; ic:spotlight ?spotlight ; ic:authorsOrdered ?authors .
  OPTIONAL { ?p ic:presentedIn ?s . ?s ic:stableId ?sessionId }
  OPTIONAL { ?p schema:about ?tc . ?tc ic:stableId ?t }
  OPTIONAL { ?p ic:list ?l }
  OPTIONAL { ?p schema:mentions ?gc . ?gc ic:stableId ?g }
  OPTIONAL { ?p ic:inCluster ?cc . ?cc ic:stableId ?cluster }
  OPTIONAL { ?p ic:authorIdsOrdered ?authorIds }
  OPTIONAL { ?p schema:abstract ?abstract }
  OPTIONAL { ?p ic:abstractSource ?abstractSource }
  OPTIONAL { ?p ic:board ?board }
}
GROUP BY ?stableId ?title ?track ?spotlight ?board ?authors ?authorIds ?sessionId ?cluster ?abstract ?abstractSource
ORDER BY ?stableId`;

export const Q_DAYS = `PREFIX schema: <http://schema.org/>
PREFIX ic: <https://w3id.org/iswc26-companion/>
SELECT ?date ?label ?subtitle
WHERE {
  ?d a schema:Event ; ic:isDay true ; ic:stableId ?date ; schema:name ?label .
  OPTIONAL { ?d schema:description ?subtitle }
}
ORDER BY ?date`;

export const Q_KINDS = `PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX ic: <https://w3id.org/iswc26-companion/>
SELECT ?kind ?label ?color
WHERE { ?k a skos:Concept ; ic:color ?color ; skos:prefLabel ?label ; ic:stableId ?kind }
ORDER BY ?kind`;

export const Q_ROOMS = `PREFIX schema: <http://schema.org/>
PREFIX ic: <https://w3id.org/iswc26-companion/>
SELECT ?id ?name ?floor
WHERE {
  ?r a schema:Place ; ic:stableId ?id ; schema:name ?name .
  OPTIONAL { ?r ic:floor ?floor }
}
ORDER BY ?id`;

// Topics; sub = glossary term ids of that topic, most mentioned first ("|"-joined, ordered).
// The second branch reads an older .rete without ic:Topic: a concept with no colour (not a kind) and not a term.
export const Q_TOPICS = `PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX ic: <https://w3id.org/iswc26-companion/>
SELECT ?id ?label ?sub
WHERE {
  { ?t a ic:Topic }
  UNION
  { ?t a skos:Concept . FILTER NOT EXISTS { ?t a ic:Topic } FILTER NOT EXISTS { ?t a ic:Term } FILTER NOT EXISTS { ?t ic:color ?c } }
  ?t skos:prefLabel ?label ; ic:stableId ?id .
  OPTIONAL { ?t ic:subOrdered ?sub }
}
ORDER BY ?id`;

export const Q_GLOSSARY = `PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX ic: <https://w3id.org/iswc26-companion/>
SELECT ?id ?term ?short ?why ?url ?category ?aliases ?caseSensitive ?generic
WHERE {
  ?g a ic:Term ; ic:stableId ?id ; skos:prefLabel ?term ; skos:definition ?short ; skos:scopeNote ?why ;
     rdfs:seeAlso ?url ; skos:broader ?b .
  OPTIONAL { ?g ic:aliasesOrdered ?aliases }
  OPTIONAL { ?g ic:caseSensitive ?caseSensitive }
  OPTIONAL { ?g ic:generic ?generic }
  ?b ic:stableId ?category .
}
ORDER BY ?id`;

// Clusters in program.json order; terms/termIds are "|"-joined and ordered.
export const Q_CLUSTERS = `PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX ic: <https://w3id.org/iswc26-companion/>
SELECT ?id ?label ?topTerms ?termIds ?size
WHERE {
  ?c a ic:Cluster ; ic:stableId ?id ; skos:prefLabel ?label ; ic:size ?size ; ic:position ?position ;
     ic:topTermsOrdered ?topTerms ; ic:termIdsOrdered ?termIds .
}
ORDER BY ?position`;

// People (paper authors, keynote speakers, organisers, chairs). itemIds = their papers and keynote talks
// ("|"-joined, sorted); roles are not queried here: data.js derives them from the sessions' speaker/organizer/chair ids.
export const Q_PEOPLE = `PREFIX schema: <http://schema.org/>
PREFIX ic: <https://w3id.org/iswc26-companion/>
SELECT ?stableId ?name ?orcid ?itemIds ?bio ?bioKind ?bioSource ?bioSources ?bioUrl ?bioLicense ?bioLicenseUrl
WHERE {
  ?p a schema:Person ; ic:stableId ?stableId ; schema:name ?name ; ic:itemIdsOrdered ?itemIds .
  OPTIONAL { ?p schema:identifier ?orcid }
  OPTIONAL { ?p schema:description ?bio ; ic:bioKind ?bioKind ; ic:bioSource ?bioSource ; ic:bioSourcesOrdered ?bioSources .
    OPTIONAL { ?p ic:bioUrl ?bioUrl } OPTIONAL { ?p ic:bioLicense ?bioLicense } OPTIONAL { ?p ic:bioLicenseUrl ?bioLicenseUrl } }
}
ORDER BY ?stableId`;

// One row per (person, organisation); ror is the organisation's ROR IRI.
export const Q_AFFILIATIONS = `PREFIX schema: <http://schema.org/>
PREFIX ic: <https://w3id.org/iswc26-companion/>
SELECT ?person ?name ?country ?ror
WHERE {
  ?p a schema:Person ; ic:stableId ?person ; schema:affiliation ?o .
  ?o schema:name ?name .
  OPTIONAL { ?o schema:addressCountry ?country }
  OPTIONAL { ?o schema:sameAs ?ror }
}
ORDER BY ?person ?name`;

// External links of papers, sessions and people; position keeps program.json order per owner.
export const Q_LINKS = `PREFIX schema: <http://schema.org/>
PREFIX ic: <https://w3id.org/iswc26-companion/>
SELECT ?owner ?position ?kind ?url ?source ?via ?stars ?liveOk ?liveCors
WHERE {
  ?o ic:externalLink ?l ; ic:stableId ?owner .
  ?l ic:linkKind ?kind ; schema:url ?url ; ic:linkSource ?source ; ic:position ?position .
  OPTIONAL { ?l ic:via ?via }
  OPTIONAL { ?l ic:stars ?stars }
  OPTIONAL { ?l ic:liveOk ?liveOk }
  OPTIONAL { ?l ic:liveCors ?liveCors }
}
ORDER BY ?owner ?position`;

// Workshop agendas (from the workshops' own websites), one row per timed item; position keeps program.json order.
export const Q_AGENDA = `PREFIX schema: <http://schema.org/>
PREFIX ic: <https://w3id.org/iswc26-companion/>
SELECT ?session ?position ?start ?end ?startISO ?endISO ?title ?kind ?block ?chairs ?note ?paperId ?speaker ?speakerId
       ?talkTitle ?abstract ?abstractSource ?byline ?url
WHERE {
  ?s ic:agendaItem ?a ; ic:stableId ?session .
  ?a ic:position ?position ; ic:start ?start ; ic:title ?title ; ic:agendaKind ?kind ; ic:startISO ?startISO .
  OPTIONAL { ?a ic:end ?end }
  OPTIONAL { ?a ic:endISO ?endISO }
  OPTIONAL { ?a ic:block ?block }
  OPTIONAL { ?a ic:chairs ?chairs }
  OPTIONAL { ?a ic:note ?note }
  OPTIONAL { ?a ic:presents ?p . ?p ic:stableId ?paperId }
  OPTIONAL { ?a ic:speaker ?speaker }
  OPTIONAL { ?a ic:speakerPerson ?sp . ?sp ic:stableId ?speakerId }
  OPTIONAL { ?a ic:talkTitle ?talkTitle }
  OPTIONAL { ?a ic:abstract ?abstract }
  OPTIONAL { ?a ic:abstractSource ?abstractSource }
  OPTIONAL { ?a ic:byline ?byline }
  OPTIONAL { ?a ic:url ?url }
}
ORDER BY ?session ?position`;

// Other recent works of people (OpenAlex), one row per work; position keeps program.json order per person.
export const Q_WORKS = `PREFIX schema: <http://schema.org/>
PREFIX ic: <https://w3id.org/iswc26-companion/>
SELECT ?owner ?position ?title ?year ?url ?venue ?citedBy
WHERE {
  ?p ic:recentWork ?w ; ic:stableId ?owner .
  ?w schema:name ?title ; schema:sameAs ?url ; ic:position ?position ; ic:citedBy ?citedBy .
  OPTIONAL { ?w ic:year ?year }
  OPTIONAL { ?w ic:venue ?venue }
}
ORDER BY ?owner ?position`;

// Datasets authored by people (on-topic only), one row per dataset.
export const Q_DATASETS = `PREFIX schema: <http://schema.org/>
PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX ic: <https://w3id.org/iswc26-companion/>
SELECT ?owner ?position ?title ?year ?url
WHERE {
  ?p ic:recentDataset ?d ; ic:stableId ?owner .
  ?d schema:name ?title ; dcat:landingPage ?url ; ic:position ?position .
  OPTIONAL { ?d ic:year ?year }
}
ORDER BY ?owner ?position`;

// Curated well-known graphs (one row per graph) and their SPARQL endpoints with liveness (one row per endpoint).
export const Q_GRAPHS = `PREFIX schema: <http://schema.org/>
PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX void: <http://rdfs.org/ns/void#>
PREFIX ic: <https://w3id.org/iswc26-companion/>
SELECT ?id ?name ?homepage
WHERE { ?g a void:Dataset ; ic:stableId ?id ; schema:name ?name ; dcat:landingPage ?homepage }
ORDER BY ?id`;

export const Q_ENDPOINTS = `PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX ic: <https://w3id.org/iswc26-companion/>
SELECT ?graph ?position ?url ?liveOk ?liveCors
WHERE {
  ?g ic:endpoint ?e ; ic:stableId ?graph .
  ?e dcat:accessURL ?url ; ic:position ?position .
  OPTIONAL { ?e ic:liveOk ?liveOk }
  OPTIONAL { ?e ic:liveCors ?liveCors }
}
ORDER BY ?graph ?position`;

// Images (paper figures from their own repositories, organisation / graph logos, the conference city, people's photos)
// with credit and licence. owner = stable id of the paper, organisation ("ror-..."), graph, person or "place";
// role = schema:image | schema:logo.
// file is relative to app/. One row per image; position orders the place photos.
export const Q_IMAGES = `PREFIX schema: <http://schema.org/>
PREFIX ic: <https://w3id.org/iswc26-companion/>
SELECT ?owner ?role ?position ?file ?width ?height ?alt ?author ?licenseName ?licenseUrl ?pageUrl
WHERE {
  ?o ic:stableId ?owner ; ?role ?i .
  FILTER (?role = schema:image || ?role = schema:logo)
  ?i a schema:ImageObject ; ic:file ?file ; schema:width ?width ; schema:height ?height ; schema:caption ?alt ;
     ic:position ?position ; schema:creditText ?author ; ic:licenseName ?licenseName ; schema:url ?pageUrl .
  OPTIONAL { ?i schema:license ?licenseUrl }
}
ORDER BY ?owner ?position ?file`;

// The graph's own example queries (pipeline/sparql_examples.yaml): sh:SPARQLExecutable resources, in gallery order.
export const Q_EXAMPLES = `PREFIX schema: <http://schema.org/>
PREFIX ic: <https://w3id.org/iswc26-companion/>
PREFIX sh: <http://www.w3.org/ns/shacl#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?id ?title ?about ?query ?position (GROUP_CONCAT(DISTINCT ?k; separator="|") AS ?keywords)
WHERE {
  ?e a sh:SPARQLExecutable ; ic:exampleId ?id ; rdfs:label ?title ; schema:position ?position .
  { ?e sh:select ?query } UNION { ?e sh:ask ?query } UNION { ?e sh:describe ?query } UNION { ?e sh:construct ?query }
  OPTIONAL { ?e rdfs:comment ?about }
  OPTIONAL { ?e schema:keywords ?k }
}
GROUP BY ?id ?title ?about ?query ?position
ORDER BY ?position`;

// The dataset's current version (data/VERSION, data/CHANGELOG.md): one row.
export const Q_DATASET = `PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX dcterms: <http://purl.org/dc/terms/>
SELECT ?version ?issued ?title
WHERE {
  ?base owl:versionIRI ?d .
  ?d owl:versionInfo ?version ; dcterms:issued ?issued .
  OPTIONAL { ?d dcterms:title ?title }
}`;
