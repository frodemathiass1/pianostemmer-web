# Eksperimenter

Ting som ikke er en del av nettstedet. Ingenting her deployes — Netlify
publiserer bare `public/`.

## prototype-flygel.html

Interaktivt flygel i Three.js: snurr rundt, hev lokket, se gjennom kassa,
og ta tak i en streng for å stemme den. Svevet du hører er ekte
interferens mellom to oscillatorsett, og gløden på strengen drives av
samme svevefrekvens — ved ren stemming står begge stille.

Hele instrumentet er bygget i kode fra én bézierkurve. Ingen 3D-modell
å laste, ingen lisenser å holde styr på. Three.js hentes fra CDN via
importmap, så det finnes ikke noe byggesteg.

Kjør den:

    python3 -m http.server 8899        # fra repo-roten, ikke fra public/
    open http://localhost:8899/eksperimenter/prototype-flygel.html

ES-moduler krever http — å åpne fila direkte med `file://` virker ikke.

Lagt på is 11. september 2026. Neste steg hvis den tas opp igjen:
spillbare tangenter, klikkbare forklaringer på delene, lazy-lasting og
en stillbildefallback for nettlesere uten WebGL.
