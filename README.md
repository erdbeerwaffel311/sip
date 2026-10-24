# 🏛️ SiP Parlament – Live-Tool für das Schüler:innenparlament

Ein modernes, responsives Echtzeit-Tool für Delegierte und die Strategieführung im Schüler:innenparlament (SiP).

## 🚀 Funktionen

- 📢 **Aktiver Antrag & Blurry Screen:** Wenn die Strategieführung einen neuen Antrag aufruft, ploppt auf allen Endgeräten ein Blurry Screen mit den Optionen *„Jetzt ansehen“* und *„Später“* auf.
- 🗳️ **Zentrale Abstimmungsempfehlung:** Großes, unübersehbares Farb-Banner (JA, NEIN, ENTHALTUNG, FREIE WAHL) mit taktischer Begründung der Strategieführung in Echtzeit.
- 🎯 **Anträge claimen:** Vorgefertigte Wortmeldungen (WM), Abänderungsanträge (ÄA), Erweiterungsanträge (EA), Streichungsanträge (SA) sowie GO-Anträge (Ende der Debatte, Ende der Redner:innenliste) können mit einem Klick geclaimed werden. Alle Teilnehmer sehen sofort `[NAME] hat [ANTRAG] geclaimed`.
- 📝 **Eigene Anträge einreichen & Prüfung:** Jedes Mitglied kann Anträge einreichen. Die Strategieführung kann diese vor der Freigabe redaktionell überarbeiten.
- 📂 **Google Drive Unterlagen & Parser:** Direkte Einbindung der SiP-Unterlagen sowie automatischer Fließtext-Scanner zur Antrags-Erkennung.
- 🎭 **Meme-Feed & Debatten-Chat:** Auflockerung langer Sitzungen mit Bild-Uploads und Live-Emoji-Reaktionen.

## 🛠️ Lokale Entwicklung

```bash
npm install
npm run dev
```

## 📦 Deployment

Wird automatisch per GitHub Actions auf GitHub Pages unter `https://erdbeerwaffel311.github.io/sip/` deployed.
