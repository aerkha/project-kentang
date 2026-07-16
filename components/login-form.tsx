"use client";

import * as React from "react";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import pb from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sprout, Eye, EyeOff, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";

export function LoginForm() {
  // State untuk Login
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  // State untuk Reset Password
  const [isResetMode, setIsResetMode] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  // ── Handler Login ──
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    const success = await login(username, password);
    if (!success) {
      setError("Email atau password salah");
    }
    setIsLoading(false);
  };

  // ── Handler Lupa Password ──
  const handleResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setResetMessage("");
    setIsResetting(true);

    try {
      // Memanggil fungsi bawaan PocketBase untuk mengirim email reset
      await pb.collection("users").requestPasswordReset(resetEmail);
      setResetMessage("Tautan pemulihan password telah dikirim ke email Anda. Silakan cek kotak masuk atau folder spam.");
      setResetEmail(""); // Bersihkan input setelah berhasil
    } catch (err) {
      console.error(err);
      setError("Gagal mengirim link reset. Pastikan email Anda sudah terdaftar di sistem.");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary mb-4 shadow-sm">
            <Sprout className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">MinBun ERP</h1>
          <p className="text-muted-foreground text-sm">Agriculture Investment Management</p>
        </div>

        <Card className="border-border shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl text-center">
              {isResetMode ? "Lupa Password" : "Sign In"}
            </CardTitle>
            <CardDescription className="text-center">
              {isResetMode
                ? "Masukkan email Anda untuk menerima tautan pemulihan sandi"
                : "Enter your credentials to access the dashboard"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            
            {/* ══════════════════════════════════════════════════════════
                MODE 1: FORM LUPA PASSWORD
            ══════════════════════════════════════════════════════════ */}
            {isResetMode ? (
              <form onSubmit={handleResetPassword} className="space-y-4">
                {error && (
                  <div className="flex items-start gap-2 p-3 text-sm text-destructive bg-destructive/10 rounded-lg">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}
                {resetMessage && (
                  <div className="flex items-start gap-2 p-3 text-sm text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{resetMessage}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email Terdaftar</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="nama@email.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                    disabled={isResetting}
                    autoFocus
                  />
                </div>

                <div className="space-y-3 pt-2">
                  <Button type="submit" className="w-full" disabled={isResetting || !resetEmail}>
                    {isResetting ? "Mengirim..." : "Kirim Tautan Reset"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setIsResetMode(false);
                      setError("");
                      setResetMessage("");
                    }}
                    disabled={isResetting}
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Kembali ke halaman Login
                  </Button>
                </div>
              </form>
            ) : (
            
            /* ══════════════════════════════════════════════════════════
                MODE 2: FORM LOGIN STANDAR
            ══════════════════════════════════════════════════════════ */
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 rounded-lg">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="username">Email</Label>
                  <Input
                    id="username"
                    type="email"
                    placeholder="Enter your email"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsResetMode(true);
                        setError("");
                        setResetEmail(username); // Otomatis mengisi email jika sebelumnya sudah diketik
                      }}
                      className="text-xs font-medium text-primary hover:underline focus:outline-none"
                      tabIndex={-1}
                    >
                      Lupa password?
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={isLoading}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full mt-2" disabled={isLoading}>
                  {isLoading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            )}

          </CardContent>
        </Card>
      </div>
    </div>
  );
}