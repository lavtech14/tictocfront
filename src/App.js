import React, { useState, useEffect } from "react";
import { io } from "socket.io-client";
import "./App.css";

const socket = io("https://tictocback.onrender.com");
// const socket = io("http://localhost:5000");

// Helper: calculate winner for dynamic board size and win length
function calculateWinner(squares, boardSize, winLength) {
  const directions = [
    [1, 0], // horizontal
    [0, 1], // vertical
    [1, 1], // diagonal down-right
    [1, -1], // diagonal up-right
  ];

  function checkDirection(start, dir) {
    const [dx, dy] = dir;
    const symbol = squares[start];
    if (!symbol) return false;

    for (let i = 1; i < winLength; i++) {
      const x = (start % boardSize) + dx * i;
      const y = Math.floor(start / boardSize) + dy * i;
      if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) return false;
      if (squares[y * boardSize + x] !== symbol) return false;
    }
    return true;
  }

  for (let i = 0; i < squares.length; i++) {
    if (!squares[i]) continue;
    for (let dir of directions) {
      if (checkDirection(i, dir)) {
        return squares[i];
      }
    }
  }
  return null;
}

export default function App() {
  const [mode, setMode] = useState("local"); // "local" or "online"
  const [boardSize, setBoardSize] = useState(3);
  const WIN_LENGTH = boardSize === 3 ? 3 : 5;

  const [board, setBoard] = useState(Array(boardSize * boardSize).fill(null));
  const [xIsNext, setXIsNext] = useState(true);
  const [winner, setWinner] = useState(null);
  const [isDraw, setIsDraw] = useState(false);

  const [roomId, setRoomId] = useState("");
  const [joined, setJoined] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [playerSymbol, setPlayerSymbol] = useState(null);

  // Score state: tracks wins for X and O (both modes)
  const [scores, setScores] = useState({ X: 0, O: 0 });

  // Reset game helper
  const resetGameForSize = (size) => {
    setBoard(Array(size * size).fill(null));
    setXIsNext(true);
    setWinner(null);
    setIsDraw(false);
    setScores({ X: 0, O: 0 });
  };

  // Update board state when board size changes
  useEffect(() => {
    resetGameForSize(boardSize);
  }, [boardSize]);

  // Multiplayer socket events setup
  useEffect(() => {
    if (mode !== "online" || !joined) return;

    // socket.emit("join-room", roomId);
    socket.emit("join-room", { roomId, size: boardSize });

    socket.on("room-data", (data) => {
      const index = data.players.indexOf(socket.id);
      setPlayerSymbol(index === 0 ? "X" : "O");
      setIsConnected(true);

      // Sync game state on join
      setBoard(data.board);
      setXIsNext(data.xIsNext);
      setWinner(calculateWinner(data.board, boardSize, WIN_LENGTH));
      setIsDraw(
        !calculateWinner(data.board, boardSize, WIN_LENGTH) &&
          data.board.every(Boolean)
      );
    });

    socket.on("move-made", (data) => {
      setBoard(data.board);
      setXIsNext(data.xIsNext);

      const w = calculateWinner(data.board, boardSize, WIN_LENGTH);
      setWinner(w);
      setIsDraw(!w && data.board.every(Boolean));

      // Update score if winner found
      if (w) {
        setScores((prev) => ({ ...prev, [w]: prev[w] + 1 }));
      }
    });

    socket.on("reset-board", () => {
      resetGameForSize(boardSize);
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
  }, [mode, joined, roomId, boardSize, WIN_LENGTH]);

  // Local mode win/draw detection
  useEffect(() => {
    if (mode === "local") {
      const w = calculateWinner(board, boardSize, WIN_LENGTH);
      setWinner(w);
      setIsDraw(!w && board.every(Boolean));

      // Update score if winner found
      if (w) {
        setScores((prev) => ({ ...prev, [w]: prev[w] + 1 }));
      }
    }
  }, [board, mode, boardSize, WIN_LENGTH]);

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
      resetGameForSize(boardSize);
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
    resetGameForSize(boardSize);
    setIsConnected(false);
    setRoomId("");
    setPlayerSymbol(null);
    setScores({ X: 0, O: 0 });
  };

  const switchToOnline = () => {
    setMode("online");
    setScores({ X: 0, O: 0 });
  };

  const renderCell = (index) => (
    <button
      className="cell"
      onClick={() => handleClick(index)}
      style={{
        width: `${400 / boardSize}px`,
        height: `${400 / boardSize}px`,
        fontSize: boardSize === 3 ? "2.5rem" : "1.5rem",
      }}
      key={index}
    >
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
    <div className="game-container">
      <h1>Tic Tac Toe</h1>

      <div className="controls">
        {/* Board size selector */}
        <div className="board-size-selector">
          <label>
            Board Size:{" "}
            <select
              value={boardSize}
              onChange={(e) => {
                const size = Number(e.target.value);
                setBoardSize(size);
              }}
              disabled={mode === "online" && joined} // Disable change if in online game
            >
              <option value={3}>3 x 3</option>
              <option value={10}>10 x 10</option>
            </select>
          </label>
        </div>

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
      </div>

      {(mode === "local" || (mode === "online" && joined)) && (
        <>
          <div className="status">{status}</div>

          <div
            className="board"
            style={{
              gridTemplateColumns: `repeat(${boardSize}, 1fr)`,
              gridTemplateRows: `repeat(${boardSize}, 1fr)`,
              width: "400px",
              height: "400px",
            }}
          >
            {board.map((_, index) => renderCell(index))}
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
