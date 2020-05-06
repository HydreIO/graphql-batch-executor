import doubt from '@hydre/doubt'
import { pipeline } from 'stream'
import tap_spec from 'tap-spec-emoji'

pipeline(
    doubt.stream(), tap_spec(), process.stdout, error => {
      if (error) console.log(error)
    },
)

import './operations.test.js'
import './subscriptions.test.js'
