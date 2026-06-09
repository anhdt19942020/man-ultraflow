# Case 08 — Plan: Massive Over-Engineering (YAGNI violation)

## Meta
- **Intent:** plan / architect / design
- **Expected verdict:** REVISE
- **Difficulty:** medium — challenger must balance "could be useful later" vs YAGNI; the task is explicitly small but the plan is enterprise-scale
- **Tests:** predict challenger must flag infeasibility / over-engineering; scenario challenger must question whether simpler alternatives were considered

## Arena prompt

```
Review this implementation plan for adding a contact form to our marketing website.
The form should send an email to the support team when submitted.
```

## Artifact (plan to review)

```markdown
## Plan: Contact Form — Enterprise Architecture

### Phase 1 — Infrastructure (Week 1-2)
- Provision a dedicated Kubernetes cluster (3 nodes) for the form microservice
- Set up Kafka (3-broker cluster) for form submission event streaming
- Configure Redis Cluster (3 shards) for rate limiting and idempotency keys
- Set up Vault for secrets management (API keys, SMTP credentials)

### Phase 2 — Backend Microservice (Week 3-4)
- Build `contact-form-service` (NestJS) as a standalone microservice
- Implement GraphQL API for form submission
- Write Kafka producer to publish `form.submitted` events
- Write Kafka consumer to trigger email dispatch
- Add distributed tracing (Jaeger) and metrics (Prometheus + Grafana dashboards)

### Phase 3 — Email Processing Pipeline (Week 5-6)
- Build `email-dispatch-service` (separate microservice, separate repo)
- Integrate with SendGrid, Mailgun, AND SES as fallback providers
- Implement exponential backoff retry queue (stored in Postgres)
- Build admin dashboard to track delivery status of every submission

### Phase 4 — Frontend (Week 7)
- React component with Zod validation
- Storybook documentation for the form component

### Phase 5 — Testing & Compliance (Week 8)
- 95% code coverage target
- GDPR compliance audit (form captures email — need DPA assessment)
- Penetration test of the contact form endpoint
- Chaos engineering: kill Kafka brokers, verify no submissions lost

### Timeline: 8 weeks | Team: 3 engineers
```

## Must-find

- **MAJOR — Massive over-engineering for a contact form:** the task is "send an email on form submit." A serverless function (Vercel Function, AWS Lambda, Cloudflare Worker) + an email API (SendGrid/Resend) is a 2-hour implementation. 8 weeks / 3 engineers / Kubernetes / Kafka / 2 microservices / distributed tracing for a contact form is a textbook YAGNI violation.
- **MAJOR — Simpler alternatives not mentioned:** no mention of form services (Formspree, Netlify Forms) or a single serverless function, which would solve the problem in hours rather than weeks.
- **MINOR (legitimate):** GDPR note is reasonable for a contact form collecting email. Storybook for a one-off form is over the top.

## Pass criteria

Caesar verdict is `REVISE` AND `upheld` includes at least ONE of: over-engineering relative to task scope, YAGNI violation, simpler alternatives not considered, timeline/team size disproportionate.

## Fail signals (arena is broken if these happen)

- Challengers accept the architecture without questioning scope fit
- Caesar ACCEPTs because "the plan is technically sound" — technical soundness ≠ appropriate for the task
- Challengers only flag MINOR style issues and miss the YAGNI elephant in the room
