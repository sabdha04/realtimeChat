import { useEffect, useState } from "react";
import toast, { Toaster } from "react-hot-toast";

const API = "http://localhost:8080";

export default function App() {
  const [socket, setSocket] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [username, setUsername] = useState(
    localStorage.getItem("username") || ""
  );
  const [isSet, setIsSet] = useState(!!token);
  const [messages, setMessages] = useState([]);
  const [globalInput, setGlobalInput] = useState("");
  const [privateInput, setPrivateInput] = useState("");
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [authMode, setAuthMode] = useState("login");
  const [formUser, setFormUser] = useState("");
  const [formPass, setFormPass] = useState("");
  const [error, setError] = useState("");

  const [privateChats, setPrivateChats] = useState({}); // { username: [{from, content, time}] }
  const [currentPrivateUser, setCurrentPrivateUser] = useState("");
  const [unreadCounts, setUnreadCounts] = useState({});

  useEffect(() => {
    if (isSet && token) {
      const ws = new WebSocket("ws://localhost:8080");
      setSocket(ws);

      // fetch global messages
      fetch(`${API}/messages`)
        .then((r) => r.json())
        .then((data) =>
          setMessages(
            data.map((m) => ({
              type: "chat",
              username: m.User.username,
              message: m.content,
              time: m.time,
            }))
          )
        );

      // fetch online users
      fetch(`${API}/online-users`)
        .then((r) => r.json())
        .then((users) => setOnlineUsers(users));

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "join", token }));
      };

      ws.onmessage = (ev) => {
        const d = JSON.parse(ev.data);
        if (d.type === "chat") setMessages((p) => [...p, d]);
        else if (d.type === "private") {
          setPrivateChats((prev) => {
            const prevMsgs = prev[d.from] || [];
            return { ...prev, [d.from]: [...prevMsgs, d] };
          });
          // Tambah unread count
          setUnreadCounts((prev) => {
            if (d.from !== currentPrivateUser) {
              const count = prev[d.from] || 0;
              return { ...prev, [d.from]: count + 1 };
            }
            return prev;
          });

          // Popup toast
          if (d.from !== currentPrivateUser) {
            toast.success(`Pesan baru dari ${d.from}: ${d.content}`, {
              duration: 4000,
              icon: "💬",
            });
            // Suara notifikasi
            // new Audio("/notification.mp3").play();
          }
        } else if (d.type === "notification") setMessages((p) => [...p, d]);
        else if (d.type === "onlineUsers") setOnlineUsers(d.users);
        else if (d.type === "error") console.warn("WS error:", d.message);
      };
      return () => ws.close();
    }
  }, [isSet, token, currentPrivateUser]);

  // Global chat send
  const sendMessage = () => {
    if (!globalInput.trim() || !socket) return;
    const time = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    socket.send(JSON.stringify({ type: "chat", content: globalInput, time }));
    setGlobalInput("");
  };

  // Private chat send
  const sendPrivateMessage = () => {
    if (!privateInput.trim() || !socket || !currentPrivateUser) return;
    const time = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const msgData = {
      type: "private",
      content: privateInput,
      to: currentPrivateUser,
      time,
    };
    socket.send(JSON.stringify(msgData));

    setPrivateChats((prev) => {
      const prevMsgs = prev[currentPrivateUser] || [];
      return {
        ...prev,
        [currentPrivateUser]: [...prevMsgs, { ...msgData, from: username }],
      };
    });
    setPrivateInput("");
  };

  // Auth
  const doAuth = async () => {
    setError("");
    const url = `${API}/auth/${authMode}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: formUser, password: formPass }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Auth error");
        return;
      }
      localStorage.setItem("token", data.token);
      localStorage.setItem("username", data.username);
      setToken(data.token);
      setUsername(data.username);
      setIsSet(true);
    } catch (err) {
      console.error(err);
      setError("Network error");
    }
  };

  const logout = () => {
    if (socket) socket.close();
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    setToken("");
    setUsername("");
    setIsSet(false);
    setMessages([]);
    setOnlineUsers([]);
    setPrivateChats({});
    setCurrentPrivateUser("");
  };

  if (!isSet) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-6 rounded shadow-md w-80">
          <h2 className="text-xl font-bold mb-4 text-center">
            {authMode === "login" ? "Login" : "Register"}
          </h2>

          <input
            className="w-full border p-2 mb-2"
            placeholder="username"
            value={formUser}
            onChange={(e) => setFormUser(e.target.value)}
          />
          <input
            className="w-full border p-2 mb-2"
            placeholder="password"
            type="password"
            value={formPass}
            onChange={(e) => setFormPass(e.target.value)}
          />

          {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

          <button
            className="w-full bg-blue-500 text-white p-2 rounded mb-2"
            onClick={doAuth}
          >
            {authMode === "login" ? "Login" : "Register"}
          </button>

          <div className="text-center text-sm">
            {authMode === "login" ? (
              <>
                Belum punya akun?{" "}
                <button
                  className="text-blue-600 underline"
                  onClick={() => setAuthMode("register")}
                >
                  Register
                </button>
              </>
            ) : (
              <>
                Sudah punya akun?{" "}
                <button
                  className="text-blue-600 underline"
                  onClick={() => setAuthMode("login")}
                >
                  Login
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Main chat UI
  return (
    <div className="flex flex-col md:flex-row max-w-6xl mx-auto mt-6 gap-6 font-sans p-4">
      <Toaster position="bottom-right" />
      {/* Global Chat */}
      <div className="flex-1 border rounded p-4 bg-white">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-2xl font-bold">Global Chat</h2>
          <div className="text-sm">
            {username}{" "}
            <button onClick={logout} className="ml-3 text-red-500">
              Logout
            </button>
          </div>
        </div>

        <div className="border rounded p-3 h-96 overflow-y-auto mb-3 bg-gray-50">
          {messages.map((m, i) =>
            m.type === "notification" ? (
              <p key={i} className="text-center text-sm italic text-gray-500">
                {m.message}
              </p>
            ) : (
              // <div key={i} className={`mb-2 ${m.username === username ? "text-right" : "text-left"}`}>
              //   <div className={`inline-block px-3 py-2 rounded ${m.username === username ? "bg-blue-500 text-white" : "bg-gray-200"}`}>
              //     <p className="text-sm"><strong>{m.username}</strong></p>
              //     <p>{m.message} <span className="ml-4 text-xs opacity-70">{m.time}</span></p>
              //   </div>
              // </div>
              <div
                key={i}
                className={`mb-2 flex ${
                  m.username === username ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`inline-block px-3 py-2 rounded ${
                    m.username === username
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200"
                  }`}
                >
                  <div className="flex flex-col">
                    <p className="text-sm font-bold text-left">{m.username}</p>
                    <p>
                      {m.message}{" "}
                      <span className="ml-2 text-xs opacity-70">{m.time}</span>
                    </p>
                  </div>
                </div>
              </div>
            )
          )}
        </div>

        <div className="flex gap-2">
          <input
            className="flex-1 border p-2"
            placeholder="Ketik pesan global..."
            value={globalInput}
            onChange={(e) => setGlobalInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          />
          <button
            className="bg-blue-500 text-white px-4 py-2 rounded"
            onClick={sendMessage}
          >
            Kirim
          </button>
        </div>
      </div>

      {/* Private Chat + Online Users */}
      <div className="w-full md:w-1/3 flex flex-col gap-4">
        {/* Private Chat */}
        <div className="border rounded p-4 bg-white flex-1 flex flex-col">
          <h3 className="text-lg font-bold mb-3">Chat Privat</h3>
          {onlineUsers.filter((u) => u !== username).length === 0 ? (
            <p className="text-gray-400">Tidak ada pengguna lain online</p>
          ) : (
            <div className="flex gap-2 flex-1">
              <div className="w-1/3 border-r pr-2 overflow-y-auto">
                <ul>
                  {onlineUsers
                    .filter((u) => u !== username)
                    .map((u, i) => (
                      <li
                        key={i}
                        className={`mb-1 cursor-pointer flex justify-between items-center ${
                          currentPrivateUser === u ? "font-bold" : ""
                        }`}
                        onClick={async () => {
                          setCurrentPrivateUser(u);
                          setUnreadCounts((prev) => ({ ...prev, [u]: 0 }));

                          // 🔹 Ambil riwayat pesan dari server
                          const res = await fetch(
                            `${API}/private-messages/${username}/${u}`
                          );
                          const data = await res.json();

                          setPrivateChats((prev) => ({
                            ...prev,
                            [u]: data.map((m) => ({
                              from: m.fromUser,
                              content: m.content,
                              time: m.time,
                            })),
                          }));
                        }}
                      >
                        <span>{u}</span>
                        {unreadCounts[u] > 0 && (
                          <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5 ml-2">
                            {unreadCounts[u]}
                          </span>
                        )}
                      </li>
                    ))}
                </ul>
              </div>
              <div className="w-2/3 flex flex-col flex-1">
                {currentPrivateUser ? (
                  <>
                    <div className="border rounded p-2 h-48 overflow-y-auto mb-2 bg-gray-50 flex-1">
                      {(privateChats[currentPrivateUser] || []).map((m, i) => (
                        <div
                          key={i}
                          className={`mb-2 flex ${
                            m.from === username
                              ? "justify-end"
                              : "justify-start"
                          }`}
                        >
                          <div
                            className={`inline-block px-2 py-1 rounded ${
                              m.from === username
                                ? "bg-green-500 text-white"
                                : "bg-gray-200"
                            }`}
                          >
                            <div className="flex flex-col">
                              <p className="text-sm font-bold text-left">
                                {m.from}
                              </p>
                              <p>
                                {m.content}
                                <span className="ml-3 text-xs opacity-70">
                                  {m.time}
                                </span>
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        className="flex-1 border p-1"
                        placeholder="Ketik pesan privat..."
                        value={privateInput}
                        onChange={(e) => setPrivateInput(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && sendPrivateMessage()
                        }
                      />
                      <button
                        className="bg-green-500 text-white px-2 py-1 rounded"
                        onClick={sendPrivateMessage}
                      >
                        Kirim
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-gray-400">
                    Pilih pengguna untuk chat privat
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Online Users Panel */}
        <div className="border rounded p-4 bg-white">
          <h3 className="text-lg font-bold mb-3">🟢 Pengguna Online</h3>
          {onlineUsers.length === 0 ? (
            <p className="text-gray-400">Tidak ada yang online</p>
          ) : (
            <ul>
              {onlineUsers.map((u, i) => (
                <li key={i} className="mb-1">
                  ✅ {u}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
