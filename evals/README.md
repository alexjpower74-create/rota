# evals/ — "is it right"

`run.mjs` checks an imported Worker against the SPC snapshot, then exercises the rota rules live.

    node evals/run.mjs --api http://localhost:6002 --leader <leader token>
    node evals/run.mjs --api https://rota.<account>.workers.dev --leader <leader token>

Exit 0 all good · 1 any miss · 2 snapshot missing. It creates two SAMPLE people, borrows the
bass slot on the next service, and puts everything back before it exits.

`selfcheck.mjs` proves the evals can fail: it runs them against `fake-api.mjs` (an in-memory
stand-in for the contract, not the real Worker) as-is, then with a wrong expected BPM, then with
the away check removed, then with stale revs accepted, and expects red each time.

    node evals/selfcheck.mjs      # logs land in evals/scratch/

`fake-api.mjs` exists only so this slice could be verified before the Worker did. Never deploy it.
