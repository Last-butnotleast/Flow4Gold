// Shared validator is bundled as code; definitions come exclusively from the Data Table.
const catalog = parseMachineCatalog($input.all().map(item => item.json));
const definitions = catalog.machines.map(item => item.definition);
const definition = catalog.machines.find(item => item.isDefault).definition;
return [{ json: { ...$('Prepare Event').first().json, definition, definitions } }];
