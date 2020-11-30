# Rate Limit

A functional rate limiter to avoid saturating external resources.

## Install

```bash
npm i @sitapati/ratelimiter
```

## Usage

The following example executes ten REST calls with 500ms between each call.

```typescript
import { RateLimiter } from "@sitapati/ratelimiter"

const limit = new RateLimiter(500)

for (let i = 0; i < 10; i++) { 
    limit(() => RESTcall(req))
        .catch(console.error)
        .then(console.log)
}
```
