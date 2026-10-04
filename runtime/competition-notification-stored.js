const expected = $('Compose Notification Record').first().json;
const rows = $input.all().map((item) => item.json);
if (rows.length !== 1) throw new Error('Notification upsert must return exactly one stored row.');
const stored = rows[0];
if (
  !Number.isSafeInteger(stored.id) ||
  stored.id < 1 ||
  Object.keys(expected).some((key) => stored[key] !== expected[key])
) {
  throw new Error('Notification upsert response does not match the intended in-app message.');
}
return [
  {
    json: {
      status: 'stored',
      persisted: true,
      channel: 'in_app',
      taskInvocationId: stored.taskInvocationId,
      caseId: stored.caseId,
      notification: stored,
      events: [],
      callbackDispatched: false,
    },
  },
];
