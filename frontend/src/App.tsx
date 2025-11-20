import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const [message, setMessage] = useState<string>('Waiting for server...')

  useEffect(() => {
    // 這裡打 localhost:8080，是因為 Tilt 幫我們做了 Port Forward
    fetch('http://localhost:8080/api/hello')
      .then(res => res.json())
      .then(data => setMessage(data.message))
      .catch(err => setMessage('Error: ' + err.message))
  }, [])

  return (
    <div className="App">
      <h1>Microservice Chat App</h1>
      <div className="card">
        <p>Server says:</p>
        {/* 顯示後端回傳的訊息 */}
        <h2>{message}</h2>
      </div>
    </div>
  )
}

export default App