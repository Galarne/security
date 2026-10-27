// Application de démonstration : affiche les variables chargées par scw-env.mjs.
for (const [k, v] of Object.entries(process.env).sort()) console.log(`${k}=${v}`);
