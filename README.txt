Maser Construction static site

DEPLOY (Cloudflare Pages, no code needed)
1. Log in to Cloudflare, go to Workers & Pages, Create, Pages, Upload assets.
2. Upload this folder (or the zip contents), name the project, deploy.
3. Custom domains: add maserconstruction.com, then point DNS as Cloudflare instructs.
   Copy your existing MX records first so email keeps working.
4. Check that https works and http redirects to https.
5. In Google Search Console, add the domain and submit https://maserconstruction.com/sitemap.xml

EDIT
Pages are plain HTML files in folders (services/, resources/, areas/, ...).
Shared styles: assets/style.css. Menu and form script: assets/site.js.
If you add or remove a page, update sitemap.xml.
