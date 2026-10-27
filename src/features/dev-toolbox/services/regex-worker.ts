import { testRegex, type RegexTestRequest, type RegexTestResult } from "./regex-tester"

interface RegexWorkerScope {
  onmessage: ((event: MessageEvent<RegexTestRequest>) => void) | null
  postMessage: (result: RegexTestResult) => void
}

const workerScope = self as unknown as RegexWorkerScope

workerScope.onmessage = ({ data }) => {
  workerScope.postMessage(testRegex(data.pattern, data.flags, data.input, data.replacement))
}
