import doubt from '@hydre/doubt'
import { pipeline } from 'stream'
import tap_spec from 'tap-spec-emoji'

pipeline(
    doubt.stream(), tap_spec(), process.stdout, error => {
      if (error) console.log(error)
    },
)

import './suites/operations.test.js'
import './suites/subscriptions.test.js'
import './suites/errors.test.js'
import './suites/internal_errors.test.js'
