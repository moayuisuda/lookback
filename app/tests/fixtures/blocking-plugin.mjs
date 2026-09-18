const block = (duration) => {
  const until = Date.now() + duration;
  while (Date.now() < until) { /* Deliberately exercise plugin isolation. */ }
};

block(100);

let calls = 0;

export const run = (payload, context) => {
  block(payload.duration);
  calls++;
  return { calls, value: payload.value, context };
};

export const crash = () => process.exit(17);
