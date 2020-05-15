import doubt from '@hydre/doubt'
import reporter from 'tap-spec-emoji'
import { pipeline } from 'stream'

import test_process_source from './suites/process_source.test.js'
import test_executor from './suites/executor.test.js'
;(async () => {
  pipeline(
      await doubt(
          test_process_source,
          test_executor,
      ),
      reporter(),
      process.stdout,
      error => {
        if (error) console.error(error)
      },
  )
})()
