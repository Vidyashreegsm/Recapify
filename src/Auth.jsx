
import { useState } from 'react';
import { supabase } from './lib/supabase';
import { GraduationCap, Mail, Lock, Sparkles } from 'lucide-react';

export default function Auth() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (error) throw error;

        if (data.session) {
          setMessage('Account created! Opening Recapify...');
        } else {
          setMessage(
            'Account created! Check your email to confirm your account, then log in.'
          );
          setMode('login');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) throw error;
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0b10] px-5 py-10 text-[#f4f4fa]">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-[#111118] p-7 shadow-2xl sm:p-9">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600">
            <GraduationCap size={29} />
          </div>

          <h1 className="mt-5 text-3xl font-bold">
            Recapify<span className="text-violet-400">.</span>
          </h1>

          <p className="mt-3 text-sm leading-6 text-gray-400">
            Your lectures, notes and study kits — synced across your devices.
          </p>
        </div>

        <div className="mb-6 grid grid-cols-2 rounded-xl bg-black/30 p-1">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
              setMessage('');
            }}
            className={`rounded-lg py-2.5 text-sm font-medium ${
              mode === 'login'
                ? 'bg-violet-600 text-white'
                : 'text-gray-400'
            }`}
          >
            Log in
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setError('');
              setMessage('');
            }}
            className={`rounded-lg py-2.5 text-sm font-medium ${
              mode === 'signup'
                ? 'bg-violet-600 text-white'
                : 'text-gray-400'
            }`}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="auth-email" className="mb-2 block text-sm text-gray-300">
              Email address
            </label>
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <Mail size={18} className="text-gray-500" />
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="auth-password" className="mb-2 block text-sm text-gray-300">
              Password
            </label>
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <Lock size={18} className="text-gray-500" />
              <input
                id="auth-password"
                type="password"
                autoComplete={
                  mode === 'signup' ? 'new-password' : 'current-password'
                }
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 6 characters"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">
              {error}
            </p>
          )}

          {message && (
            <p role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-300">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3.5 text-sm font-semibold transition hover:bg-violet-500 disabled:opacity-60"
          >
            <Sparkles size={17} />
            {loading
              ? 'Please wait...'
              : mode === 'signup'
                ? 'Create account'
                : 'Log in to Recapify'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs leading-5 text-gray-500">
          Your account gives you access to your own saved study materials.
        </p>
      </section>
    </main>
  );
}
