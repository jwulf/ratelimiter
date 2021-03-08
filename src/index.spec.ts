import { RateLimiter } from ".";
import fs from "fs";
import { rootCertificates } from "tls";

const limit = new RateLimiter(2000);

test("Handles a Promise Task", async () => {
  const res = await limit.runRateLimited({
    task: () =>
      new Promise((resolve, reject) =>
        fs.readdir(__dirname, (err, files) =>
          err ? reject(err) : resolve(files)
        )
      ),
  });
  expect(Array.isArray(res)).toBe(true);
});

test("Handles a Synchronous Task", async () => {
  const res = await limit.runRateLimited({
    task: () => fs.readdirSync(__dirname),
  });
  expect(Array.isArray(res)).toBe(true);
});

test("Limits calls", (done) => {
  const mockThing = (() => {
    const calls: any[] = [];
    return {
      call: () => {
        const now = new Date();
        const n = calls.length;
        const durationSinceLastCall =
          n === 0 ? now : (now as any) - calls[n - 1];
        calls.push(durationSinceLastCall);
        return durationSinceLastCall;
      },
      calls,
    };
  })();

  const r0 = limit.runRateLimited({
    task: () => mockThing.call(),
  });
  const r1 = limit.runRateLimited({
    task: () => mockThing.call(),
  });
  r0.then(() => expect(mockThing.calls.length).toBe(1));
  r1.then(() => {
    expect(mockThing.calls.length).toBe(2);
    expect(mockThing.calls[1]).toBeGreaterThan(1980);
    expect(mockThing.calls[1]).toBeLessThan(2105);
    done();
  });
});
