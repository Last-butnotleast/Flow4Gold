// Shared validator is bundled as code; definitions come exclusively from the Data Table.
const definitions = parseMachineDefinitions($input.all().map(item => item.json));
return [{ json: { ...$('Prepare Event').first().json, definitions } }];
