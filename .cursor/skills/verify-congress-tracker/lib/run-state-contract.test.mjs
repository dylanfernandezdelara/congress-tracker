import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createStateStore, salvageEndpointsFromText, salvagePidsFromText } from './run-state.mjs'

test('run-state store: atomic replace, pid merge, corrupt sentinel, salvage', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-run-state-'))
  const statePath = path.join(dir, 'state.json')
  const store = createStateStore(statePath)
  store.writeState({ runId: 'a', pids: { worker: 1 } })
  assert.equal(store.readState().runId, 'a')
  store.updateState({ pids: { web: 2 } })
  assert.deepEqual(store.readState().pids, { worker: 1, web: 2 })
  fs.writeFileSync(statePath, '{bad')
  assert.deepEqual(store.readStateOrCorrupt(), { state: null, corrupt: true })
  assert.throws(() => store.readState(), /state\.json is corrupt; run cleanup/)
  assert.deepEqual(salvagePidsFromText('{"pids":{"worker":11,"web":22,"browser":33,"tap":44}}'), [
    11, 22, 33, 44,
  ])
  assert.deepEqual(salvagePidsFromText('"worker": 9\n"tap": 8'), [9, 8])
  assert.deepEqual(salvageEndpointsFromText('{"webPort":6100,"workerPort":6101,"cdpPort":6102}'), {
    webPort: 6100,
    workerPort: 6101,
    cdpPort: 6102,
  })
  assert.deepEqual(salvageEndpointsFromText('"webPort": 5174\n"cdpPort": 9223'), {
    webPort: 5174,
    cdpPort: 9223,
  })
  fs.rmSync(dir, { recursive: true, force: true })
})
