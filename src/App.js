import React, { useState, useEffect } from "react";
import { io } from "socket.io-client";
import "./App.css";

const socket = io("http://localhost:5000");

// Winning combinations
const WINNING_COMBINATIONS = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function calculateWinner(squares) {
  for (let combo of WINNING_COMBINATIONS) {
    const [a, b, c] = combo;
    if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
      return squares[a];
    }
  }
  return null;
}

export default function App() {
  const [mode, setMode] = useState("local"); // "local" or "online"
  const [board, setBoard] = useState(Array(9).fill(null));
  const [xIsNext, setXIsNext] = useState(true);
  const [winner, setWinner] = useState(null);
  const [isDraw, setIsDraw] = useState(false);

  const [roomId, setRoomId] = useState("");
  const [joined, setJoined] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [playerSymbol, setPlayerSymbol] = useState(null);

  // Score state: tracks wins for X and O (both modes)
  const [scores, setScores] = useState({ X: 0, O: 0 });

  // Multiplayer socket events setup
  useEffect(() => {
    if (mode !== "online" || !joined) return;

    socket.emit("join-room", roomId);

    socket.on("room-data", (data) => {
      const index = data.players.indexOf(socket.id);
      setPlayerSymbol(index === 0 ? "X" : "O");
      setIsConnected(true);

      // Sync game state on join
      setBoard(data.board);
      setXIsNext(data.xIsNext);
      setWinner(calculateWinner(data.board));
      setIsDraw(!calculateWinner(data.board) && data.board.every(Boolean));
    });

    socket.on("move-made", (data) => {
      setBoard(data.board);
      setXIsNext(data.xIsNext);

      const w = calculateWinner(data.board);
      setWinner(w);
      setIsDraw(!w && data.board.every(Boolean));

      // Update score if winner found
      if (w) {
        setScores((prev) => ({ ...prev, [w]: prev[w] + 1 }));
      }
    });

    socket.on("reset-board", () => {
      setBoard(Array(9).fill(null));
      setXIsNext(true);
      setWinner(null);
      setIsDraw(false);
    });

    socket.on("room-full", () => {
      alert("Room is full! Please try another room.");
      setJoined(false);
      setIsConnected(false);
      setPlayerSymbol(null);
      setRoomId("");
    });

    return () => {
      socket.off("room-data");
      socket.off("move-made");
      socket.off("reset-board");
      socket.off("room-full");
    };
  }, [mode, joined, roomId]);

  // Local mode win/draw detection
  useEffect(() => {
    if (mode === "local") {
      const w = calculateWinner(board);
      setWinner(w);
      setIsDraw(!w && board.every(Boolean));

      // Update score if winner found
      if (w) {
        setScores((prev) => ({ ...prev, [w]: prev[w] + 1 }));
      }
    }
  }, [board, mode]);

  const handleClick = (index) => {
    if (board[index] || winner || isDraw) return;

    if (mode === "local") {
      const newBoard = [...board];
      newBoard[index] = xIsNext ? "X" : "O";
      setBoard(newBoard);
      setXIsNext(!xIsNext);
    } else if (mode === "online") {
      if (!isConnected) return;

      // Only allow player to move on their turn
      if (
        (xIsNext && playerSymbol !== "X") ||
        (!xIsNext && playerSymbol !== "O")
      )
        return;

      socket.emit("make-move", { roomId, index });
    }
  };

  const resetGame = () => {
    if (mode === "local") {
      setBoard(Array(9).fill(null));
      setXIsNext(true);
      setWinner(null);
      setIsDraw(false);
    } else if (mode === "online" && joined) {
      socket.emit("reset-game", roomId);
    }
  };

  const handleJoinRoom = () => {
    if (roomId.trim() === "") return;
    setJoined(true);
  };

  const switchToLocal = () => {
    setMode("local");
    setJoined(false);
    setBoard(Array(9).fill(null));
    setXIsNext(true);
    setWinner(null);
    setIsDraw(false);
    setIsConnected(false);
    setRoomId("");
    setPlayerSymbol(null);
    setScores({ X: 0, O: 0 }); // Reset scores when switching mode (optional)
  };

  const switchToOnline = () => {
    setMode("online");
    setScores({ X: 0, O: 0 }); // Reset scores on mode switch (optional)
  };

  const renderCell = (index) => (
    <button className="cell" onClick={() => handleClick(index)}>
      {board[index]}
    </button>
  );

  let status = "";
  if (mode === "local") {
    if (winner) status = `Winner: ${winner}`;
    else if (isDraw) status = "It's a Draw!";
    else status = `Next: ${xIsNext ? "X" : "O"}`;
  } else if (mode === "online") {
    if (!joined) status = "";
    else if (!isConnected) status = "Waiting for opponent to join...";
    else if (winner) status = `Winner: ${winner}`;
    else if (isDraw) status = "It's a Draw!";
    else {
      const yourTurn =
        (xIsNext && playerSymbol === "X") || (!xIsNext && playerSymbol === "O");
      status = `Next: ${xIsNext ? "X" : "O"} (${
        yourTurn ? "You" : "Opponent"
      })`;
    }
  }

  return (
    <div className="game">
      <h1>Tic Tac Toe</h1>

      {mode === "local" && (
        <button className="mode-switch" onClick={switchToOnline}>
          🌐 Switch to Multiplayer
        </button>
      )}

      {mode === "online" && !joined && (
        <div className="room-join">
          <h3>Enter Room ID</h3>
          <input
            type="text"
            placeholder="Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />
          <button onClick={handleJoinRoom} disabled={!roomId.trim()}>
            Join
          </button>
          <button onClick={switchToLocal}>← Back to Local Game</button>
        </div>
      )}

      {(mode === "local" || (mode === "online" && joined)) && (
        <>
          <div className="status">{status}</div>

          <div className="board">
            {[0, 1, 2].map((row) => (
              <div key={row} className="row">
                {renderCell(row * 3)}
                {renderCell(row * 3 + 1)}
                {renderCell(row * 3 + 2)}
              </div>
            ))}
          </div>

          <button className="reset" onClick={resetGame}>
            🔁 Restart Game
          </button>

          <div className="scoreboard">
            <p>
              Score — X: {scores.X} | O: {scores.O}
            </p>
          </div>

          {mode === "online" && joined && (
            <>
              <p>
                You are: <strong>{playerSymbol}</strong>
              </p>
              <p>
                Room: <strong>{roomId}</strong>
              </p>
              <button className="mode-switch" onClick={switchToLocal}>
                ← Back to Local Game
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
