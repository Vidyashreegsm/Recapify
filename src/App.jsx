import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AudioLines,
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  FolderOpen,
  GraduationCap,
  LayoutDashboard,
  Layers3,
  LoaderCircle,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  Sparkles,
  Upload,
  Video,
  X,
} from 'lucide-react';

import Auth from './Auth';
import { supabase } from './lib/supabase';

const API_BASE = 'http://localhost:5000';
const STORAGE_KEY = 'recapify-lectures';

const tools = [
  { title: 'Smart Notes', description: 'Turn long lectures into clear, structured notes.', icon: FileText, color: 'violet', label: 'AI SUMMARY' },
  { title: 'Flashcards', description: 'Remember key concepts with active recall.', icon: Layers3, color: 'blue', label: 'STUDY SMARTER' },
  { title: 'Practice Quiz', description: 'Test your understanding with custom questions.', icon: Brain, color: 'pink', label: 'TEST YOURSELF' },
  { title: 'Concept Maps', description: 'Connect important ideas visually.', icon: AudioLines, color: 'green', label: 'SEE THE BIG PICTURE' },
];

const initialLectures = [
  { title: 'Introduction to Machine Learning', subject: 'Artificial Intelligence', duration: '42 min', date: 'Today', color: 'violet', demo: true },
  { title: 'Database Normalization', subject: 'Database Management', duration: '36 min', date: 'Yesterday', color: 'blue', demo: true },
  { title: 'Neural Networks Explained', subject: 'Deep Learning', duration: '58 min', date: 'Oct 20', color: 'pink', demo: true },
];

function parseStudyKit(raw) {
  if (typeof raw !== 'string') return raw;

  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  try {
    return JSON.parse(cleaned);
  } catch {
    return { title: 'Generated study kit', summary: cleaned, notes: [], flashcards: [], quiz: [] };
  }
}

function loadLectures() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : initialLectures;
  } catch {
    return initialLectures;
  }
}

function Dashboard({ user, onSignOut }) {
  const [activePage, setActivePage] = useState('Overview');
  const [lectures, setLectures] = useState([]);
  const [lecturesLoading, setLecturesLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [youtubeUrl, setVideoUrl] = useState('');
  const [inputMode, setInputMode] = useState('youtube');
  const [uploadMessage, setUploadMessage] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [studyKit, setStudyKit] = useState(null);
  const [resultTab, setResultTab] = useState('notes');
  const [openFlashcard, setOpenFlashcard] = useState(0);
  const [showFlashcardAnswer, setShowFlashcardAnswer] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState({});
  const fileInput = useRef(null);
useEffect(() => {
  let active = true;

  async function loadCloudLectures() {
    setLecturesLoading(true);

    const { data, error: loadError } = await supabase
      .from('lectures')
      .select('*')
      .order('created_at', { ascending: false });

    if (!active) return;

    if (loadError) {
      setError(`Could not load your saved lectures: ${loadError.message}`);
      setLectures([]);
    } else {
      setLectures(
        (data || []).map((row) => ({
          title: row.title,
          subject:
            row.source_type === 'upload'
              ? 'Uploaded video'
              : 'YouTube lecture',
          duration: 'AI processed',
          date: new Date(row.created_at).toLocaleDateString(),
          color: 'violet',
          studyKit: row.study_kit,
          cloudId: row.id,
          sourceUrl: row.source_url,
        }))
      );
    }

    setLecturesLoading(false);
  }

  loadCloudLectures();

  return () => {
    active = false;
  };
}, [user.id]);
  // FIX: Hooks must be declared at the top level of App(),
  // never inside processYouTube(), processVideo(), or another function.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lectures));
    } catch (err) {
      console.error('Could not save Recapify lectures:', err);
    }
  }, [lectures]);

  function handleFile(file) {
    setError('');
    setUploadMessage('');

    if (!file) return;

    if (!file.type.startsWith('video/')) {
      setError('Please select a video file.');
      setSelectedFile(null);
      return;
    }

    if (file.size > 500 * 1024 * 1024) {
      setError('The maximum video size is 500 MB.');
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setUploadMessage('Video selected and ready for AI processing.');
  }

  async function addProcessedLecture(
  kit,
  subject,
  fallbackTitle,
  sourceType,
  sourceUrl = null
) {
  const title = kit.title || fallbackTitle;

  const { data, error: saveError } = await supabase
    .from('lectures')
    .insert({
      user_id: user.id,
      title,
      source_type: sourceType,
      source_url: sourceUrl,
      study_kit: kit,
    })
    .select()
    .single();

  if (saveError) {
    throw new Error(
      `Study kit generated, but cloud saving failed: ${saveError.message}`
    );
  }

  const savedKit = data.study_kit;

  setStudyKit(savedKit);
  setResultTab('notes');
  setOpenFlashcard(0);
  setShowFlashcardAnswer(false);
  setQuizAnswers({});

  setLectures((current) => [
    {
      title: data.title,
      subject,
      duration: 'AI processed',
      date: new Date(data.created_at).toLocaleDateString(),
      color: 'violet',
      studyKit: savedKit,
      cloudId: data.id,
      sourceUrl: data.source_url,
    },
    ...current,
  ]);

  setUploadMessage('Your study kit is ready and saved to your account!');
  setActivePage('Smart Notes');
}

  async function processYouTube(event) {
    event.preventDefault();
    setError('');
    setUploadMessage('');
    setStudyKit(null);

    if (!youtubeUrl.trim()) {
      setError('Paste a YouTube lecture link first.');
      return;
    }

    setIsProcessing(true);

    try {
      const response = await fetch(`${API_BASE}/api/lectures/youtube`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: youtubeUrl.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Could not process this YouTube video.');
      }

      const kit = parseStudyKit(data.result);
      await addProcessedLecture(
  kit,
  'YouTube lecture',
  'YouTube lecture',
  'youtube',
  youtubeUrl.trim()
);
    } catch (err) {
      setError(`${err.message} Make sure the backend is running on port 5000.`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function processVideo(event) {
    event.preventDefault();
    setError('');
    setUploadMessage('');
    setStudyKit(null);

    if (!selectedFile) {
      setError('Choose a video file first.');
      return;
    }

    setIsProcessing(true);

    try {
      const formData = new FormData();
      formData.append('video', selectedFile);

      const response = await fetch(`${API_BASE}/api/lectures/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Could not process this video.');
      }

      const kit = parseStudyKit(data.result);
      const fallbackTitle = selectedFile.name.replace(/\.[^/.]+$/, '');

      await addProcessedLecture(
  kit,
  'Uploaded video',
  fallbackTitle,
  'upload'
);
      setSelectedFile(null);

      if (fileInput.current) {
        fileInput.current.value = '';
      }
    } catch (err) {
  setError(err.message || 'Something went wrong. Please try again.');
}finally {
      setIsProcessing(false);
    }
  }

  const filteredLectures = lectures.filter((lecture) =>
    `${lecture.title} ${lecture.subject}`.toLowerCase().includes(search.toLowerCase())
  );

  const processedLectures = lectures.filter((lecture) => lecture.studyKit);

  const totalFlashcards = processedLectures.reduce(
    (total, lecture) => total + (lecture.studyKit.flashcards?.length || 0),
    0
  );

  const totalQuizQuestions = processedLectures.reduce(
    (total, lecture) => total + (lecture.studyKit.quiz?.length || 0),
    0
  );

  const navigation = [
    { label: 'Overview', icon: LayoutDashboard },
    { label: 'My Lectures', icon: FolderOpen },
    { label: 'Smart Notes', icon: FileText },
    { label: 'Flashcards', icon: Layers3 },
    { label: 'Practice Quiz', icon: Brain },
  ];

  function openLecture(lecture) {
    if (lecture.studyKit) {
      setStudyKit(lecture.studyKit);
      setActivePage('Smart Notes');
      setResultTab('notes');
      setOpenFlashcard(0);
      setShowFlashcardAnswer(false);
      setQuizAnswers({});
    } else {
      setStudyKit(null);
      setActivePage('Overview');
      setUploadMessage('This is a sample lecture. Process a video or YouTube link to generate real study materials.');
      document.getElementById('upload-section')?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  function renderStudyKit() {
    if (!studyKit) {
      return (
        <div className="rounded-2xl border border-white/[0.07] bg-[#111118] p-8 text-center sm:p-12">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-300">
            <Sparkles size={25} />
          </span>
          <h2 className="mt-5 text-lg font-semibold">Your study kit will appear here.</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-400">
            Process a YouTube lecture or upload a video from the Overview page to generate notes, flashcards, and a quiz.
          </p>
          <button onClick={() => setActivePage('Overview')} className="mt-6 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold hover:bg-violet-500">
            Add a lecture
          </button>
        </div>
      );
    }

    const flashcards = studyKit.flashcards || [];
    const quiz = studyKit.quiz || [];
    const notes = studyKit.notes || [];

    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-violet-400/15 bg-gradient-to-br from-violet-500/[0.10] to-[#111118] p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
              <Sparkles size={21} />
            </span>
            <div>
              <p className="text-xs font-semibold tracking-[0.15em] text-violet-300">AI-GENERATED STUDY KIT</p>
              <h2 className="mt-2 text-xl font-semibold">{studyKit.title || 'Your lecture summary'}</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-gray-300">{studyKit.summary || 'No summary was returned.'}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            ['notes', 'Smart Notes', FileText],
            ['flashcards', 'Flashcards', Layers3],
            ['quiz', 'Practice Quiz', Brain],
          ].map(([key, label, Icon]) => (
            <button key={key} onClick={() => setResultTab(key)} className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition ${resultTab === key ? 'border-violet-400/40 bg-violet-500/15 text-violet-200' : 'border-white/10 text-gray-400 hover:bg-white/[0.04]'}`}>
              <Icon size={16} />{label}
            </button>
          ))}
        </div>

        {resultTab === 'notes' && (
          <div className="space-y-3">
            {notes.length ? notes.map((note, index) => (
              <article key={`${note.heading}-${index}`} className="rounded-2xl border border-white/[0.07] bg-[#111118] p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">{note.heading || `Key concept ${index + 1}`}</h3>
                  {note.timestamp && <span className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500/10 px-2.5 py-1 text-xs text-violet-300"><Clock3 size={13} />{note.timestamp}</span>}
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-gray-300">{note.content}</p>
              </article>
            )) : (
              <div className="whitespace-pre-wrap rounded-2xl border border-white/[0.07] bg-[#111118] p-5 text-sm leading-7 text-gray-300">
                {studyKit.summary || 'No structured notes were returned.'}
              </div>
            )}
          </div>
        )}

        {resultTab === 'flashcards' && (
          <div className="rounded-2xl border border-white/[0.07] bg-[#111118] p-6 sm:p-8">
            {flashcards.length ? (
              <>
                <div className="mb-5 flex items-center justify-between text-xs text-gray-500">
                  <span>FLASHCARD {openFlashcard + 1} OF {flashcards.length}</span>
                  <span>Click the card to {showFlashcardAnswer ? 'see the question' : 'reveal the answer'}</span>
                </div>
                <button onClick={() => setShowFlashcardAnswer((shown) => !shown)} className="flex min-h-56 w-full flex-col items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-500/[0.06] p-7 text-center transition hover:bg-violet-500/[0.10]">
                  <span className="text-xs font-semibold tracking-[0.15em] text-violet-300">{showFlashcardAnswer ? 'ANSWER' : 'QUESTION'}</span>
                  <p className="mt-4 text-lg font-medium leading-8">
                    {showFlashcardAnswer ? flashcards[openFlashcard]?.answer : flashcards[openFlashcard]?.question}
                  </p>
                  <p className="mt-5 text-xs text-gray-500">Click to {showFlashcardAnswer ? 'see question' : 'reveal answer'}</p>
                </button>
                <div className="mt-4 flex justify-between gap-3">
                  <button onClick={() => { setOpenFlashcard((current) => current <= 0 ? flashcards.length - 1 : current - 1); setShowFlashcardAnswer(false); }} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm hover:bg-white/[0.04]">Previous</button>
                  <button onClick={() => { setOpenFlashcard((current) => (current + 1) % flashcards.length); setShowFlashcardAnswer(false); }} className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold hover:bg-violet-500">Next card <ChevronRight size={15} className="ml-1 inline" /></button>
                </div>
              </>
            ) : <p className="text-sm text-gray-400">No flashcards were returned for this lecture.</p>}
          </div>
        )}

        {resultTab === 'quiz' && (
          <div className="space-y-4">
            {quiz.length ? quiz.map((question, index) => {
              const chosen = quizAnswers[index];
              const correct = chosen === question.correctAnswer;

              return (
                <article key={`${question.question}-${index}`} className="rounded-2xl border border-white/[0.07] bg-[#111118] p-5">
                  <p className="text-xs font-semibold tracking-wider text-violet-300">QUESTION {index + 1}</p>
                  <h3 className="mt-2 font-semibold leading-6">{question.question}</h3>
                  <div className="mt-4 space-y-2">
                    {(question.options || []).map((option) => (
                      <button key={option} disabled={chosen !== undefined} onClick={() => setQuizAnswers((current) => ({ ...current, [index]: option }))} className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${chosen === option ? (option === question.correctAnswer ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-rose-400/40 bg-rose-500/10 text-rose-200') : 'border-white/10 text-gray-300 hover:bg-white/[0.04]'} ${chosen !== undefined && option === question.correctAnswer ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : ''}`}>
                        {option}
                      </button>
                    ))}
                  </div>
                  {chosen !== undefined && (
                    <div className="mt-4 rounded-xl bg-white/[0.035] p-4 text-sm leading-6 text-gray-300">
                      <p className={`font-semibold ${correct ? 'text-emerald-300' : 'text-rose-300'}`}>{correct ? 'Correct!' : `Correct answer: ${question.correctAnswer}`}</p>
                      <p className="mt-1">{question.explanation}</p>
                    </div>
                  )}
                </article>
              );
            }) : <p className="rounded-2xl border border-white/[0.07] bg-[#111118] p-5 text-sm text-gray-400">No quiz questions were returned for this lecture.</p>}
            {quiz.length > 0 && <button onClick={() => setQuizAnswers({})} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm hover:bg-white/[0.04]">Try quiz again</button>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="recapify-app relative min-h-screen overflow-x-hidden bg-[#080b16] text-[#f4f5ff]">
      <aside className={`fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-violet-300/[0.10] bg-[#0c1020]/95 px-5 py-6 shadow-2xl shadow-black/20 backdrop-blur-2xl transition-transform duration-300 lg:translate-x-0 ${mobileMenu ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between">
          <button onClick={() => { setActivePage('Overview'); setMobileMenu(false); }} className="flex items-center gap-3 text-left">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 shadow-lg shadow-violet-600/20"><GraduationCap size={23} /></div>
            <span className="text-xl font-bold tracking-tight">Recapify<span className="text-violet-400">.</span></span>
          </button>
          <button onClick={() => setMobileMenu(false)} className="rounded-lg p-2 text-gray-400 lg:hidden" aria-label="Close menu"><X size={20} /></button>
        </div>

        <div className="mt-10">
          <p className="mb-3 px-3 text-[10px] font-bold tracking-[0.2em] text-gray-500">WORKSPACE</p>
          <nav className="space-y-1">
            {navigation.map(({ label, icon: Icon }) => (
              <button key={label} onClick={() => { setActivePage(label); setMobileMenu(false); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${activePage === label ? 'bg-violet-500/15 font-medium text-violet-300' : 'text-gray-400 hover:bg-white/[0.04] hover:text-white'}`}>
                <Icon size={18} />{label}
                {label === 'My Lectures' && <span className="ml-auto rounded-md bg-white/[0.07] px-2 py-0.5 text-xs">{lectures.length}</span>}
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-9">
          <p className="mb-3 px-3 text-[10px] font-bold tracking-[0.2em] text-gray-500">PERSONAL</p>
          <button onClick={() => { setActivePage('Settings'); setMobileMenu(false); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm ${activePage === 'Settings' ? 'bg-violet-500/15 text-violet-300' : 'text-gray-400 hover:bg-white/[0.04] hover:text-white'}`}><Settings size={18} />Settings</button>
        </div>

        <div className="mt-auto rounded-2xl border border-violet-400/15 bg-gradient-to-br from-violet-500/10 to-indigo-500/[0.03] p-4">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300"><Sparkles size={19} /></div>
          <p className="text-sm font-semibold">Learn a little better.</p>
          <p className="mt-1 text-xs leading-5 text-gray-400">Turn passive watching into active learning.</p>
          <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full w-2/3 rounded-full bg-violet-400" /></div>
          <p className="mt-2 text-[10px] text-gray-500">YOUR AI STUDY SPACE</p>
        </div>
      </aside>

      {mobileMenu && <button className="fixed inset-0 z-20 bg-black/60 lg:hidden" onClick={() => setMobileMenu(false)} aria-label="Close navigation overlay" />}

      <main className="min-h-screen lg:ml-64">
        <header className="sticky top-0 z-10 flex h-[76px] items-center justify-between border-b border-white/[0.08] bg-[#080b16]/85 px-5 backdrop-blur-2xl sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <button className="rounded-lg border border-white/10 p-2 text-gray-300 lg:hidden" onClick={() => setMobileMenu(true)} aria-label="Open navigation"><Menu size={20} /></button>
            <div><p className="text-sm font-semibold">{activePage}</p><p className="hidden text-xs text-gray-500 sm:block">Your learning space, all in one place.</p></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2 sm:flex">
              <Search size={15} className="text-gray-500" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search lectures..." className="w-36 bg-transparent text-xs text-white outline-none placeholder:text-gray-600 md:w-44" aria-label="Search lectures" />
            </div>
            <div className="hidden max-w-40 truncate text-xs text-gray-400 sm:block">
  {user.email}
</div>

<button
  type="button"
  onClick={onSignOut}
  className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-gray-300 transition hover:border-rose-400/30 hover:text-rose-300"
  aria-label="Log out"
>
  <LogOut size={15} />
  <span>Log out</span>
</button>
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] px-5 py-8 sm:px-8 sm:py-10 lg:px-10">
          {activePage === 'Overview' && (
            <>
              <section className="animate-fade-up">
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div>
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-500/[0.08] px-3 py-1.5 text-[11px] font-medium text-violet-300"><Sparkles size={13} />YOUR PERSONAL AI STUDY SPACE</div>
                    <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Learn smarter, <span className="text-violet-400">not longer.</span></h1>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-gray-400">Transform your lecture videos into notes, flashcards, and quizzes. Spend less time rewinding and more time understanding.</p>
                  </div>
                  <button onClick={() => document.getElementById('upload-section')?.scrollIntoView({ behavior: 'smooth' })} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold shadow-lg shadow-violet-600/20 transition hover:bg-violet-500"><Plus size={17} />Add a lecture</button>
                </div>
              </section>

              <section className="mt-9 grid gap-4 sm:grid-cols-3">
                {[
                  { label: 'LECTURES PROCESSED', value: processedLectures.length, description: 'AI-generated study kits', icon: Video, color: 'text-violet-300', bg: 'bg-violet-500/10' },
                  { label: 'FLASHCARDS CREATED', value: totalFlashcards, description: 'Cards ready for revision', icon: Layers3, color: 'text-blue-300', bg: 'bg-blue-500/10' },
                  { label: 'QUIZ QUESTIONS', value: totalQuizQuestions, description: 'Questions ready to practice', icon: Brain, color: 'text-pink-300', bg: 'bg-pink-500/10' },
                ].map(({ label, value, description, icon: Icon, color, bg }) => (
                  <div key={label} className="rounded-2xl border border-white/[0.07] bg-[#111118] p-5 transition hover:border-white/[0.12]">
                    <div className="flex items-center justify-between"><p className="text-[10px] font-semibold tracking-[0.15em] text-gray-500">{label}</p><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${bg} ${color}`}><Icon size={18} /></span></div>
                    <p className="mt-5 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-gray-500">{description}</p>
                  </div>
                ))}
              </section>

              <section className="mt-10">
                <div className="mb-5"><p className="text-xs font-semibold tracking-[0.16em] text-violet-300">YOUR STUDY TOOLKIT</p><h2 className="mt-2 text-xl font-semibold">One lecture. Four ways to learn.</h2></div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {tools.map(({ title, description, icon: Icon, color, label }) => (
                    <button key={title} onClick={() => setActivePage(title)} className="group rounded-2xl border border-white/[0.07] bg-[#111118] p-5 text-left transition duration-200 hover:-translate-y-1 hover:border-violet-400/30 hover:bg-[#15141e]">
                      <div className="flex items-center justify-between"><span className={`flex h-11 w-11 items-center justify-center rounded-xl ${color === 'violet' ? 'bg-violet-500/15 text-violet-300' : color === 'blue' ? 'bg-blue-500/15 text-blue-300' : color === 'pink' ? 'bg-pink-500/15 text-pink-300' : 'bg-emerald-500/15 text-emerald-300'}`}><Icon size={21} /></span><ChevronRight size={17} className="text-gray-600 transition group-hover:translate-x-1 group-hover:text-violet-300" /></div>
                      <p className="mt-5 text-[10px] font-semibold tracking-[0.12em] text-gray-500">{label}</p><h3 className="mt-2 font-semibold">{title}</h3><p className="mt-2 min-h-10 text-xs leading-5 text-gray-400">{description}</p>
                    </button>
                  ))}
                </div>
              </section>

              <section id="upload-section" className="mt-10 scroll-mt-24">
                <div className="mb-5"><p className="text-xs font-semibold tracking-[0.16em] text-violet-300">GET STARTED</p><h2 className="mt-2 text-xl font-semibold">Bring your lecture to life.</h2><p className="mt-2 text-sm text-gray-400">Paste a YouTube link or upload a video to generate your study kit.</p></div>
                <div className="rounded-2xl border border-white/[0.08] bg-[#111118] p-4 sm:p-6">
                  <div className="mb-5 flex flex-wrap gap-2">
                    <button onClick={() => { setInputMode('youtube'); setError(''); setUploadMessage(''); }} className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm ${inputMode === 'youtube' ? 'border-violet-400/40 bg-violet-500/15 text-violet-200' : 'border-white/10 text-gray-400'}`}><Video size={17} />YouTube link</button>
                    <button onClick={() => { setInputMode('upload'); setError(''); setUploadMessage(''); }} className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm ${inputMode === 'upload' ? 'border-violet-400/40 bg-violet-500/15 text-violet-200' : 'border-white/10 text-gray-400'}`}><Upload size={17} />Video upload</button>
                  </div>

                  {inputMode === 'youtube' ? (
                    <form onSubmit={processYouTube} className="space-y-4">
                      <label htmlFor="youtube-url" className="block text-sm font-medium text-gray-300">YouTube lecture URL</label>
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 focus-within:border-violet-400/40"><Video size={19} className="shrink-0 text-red-400" /><input id="youtube-url" type="url" value={youtubeUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-600" /></div>
                        <button type="submit" disabled={isProcessing} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60">{isProcessing ? <><LoaderCircle size={17} className="animate-spin" />Processing...</> : <><Sparkles size={17} />Generate study kit</>}</button>
                      </div>
                      <p className="text-xs text-gray-500">Public, supported YouTube videos only. Processing time and availability depend on Gemini API limits.</p>
                    </form>
                  ) : (
                    <form onSubmit={processVideo} className="space-y-4">
                      <button type="button" onClick={() => fileInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); handleFile(event.dataTransfer.files?.[0]); }} className="flex min-h-44 w-full flex-col items-center justify-center rounded-xl border border-dashed border-violet-400/30 bg-violet-500/[0.035] px-4 py-7 text-center transition hover:border-violet-400/60 hover:bg-violet-500/[0.07]">
                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-500/10 text-violet-300"><Upload size={23} /></span>
                        <span className="mt-4 text-sm font-semibold">{selectedFile ? selectedFile.name : 'Drop your lecture video here'}</span>
                        <span className="mt-2 text-xs text-gray-500">{selectedFile ? `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB · Click to change` : 'or click to browse your files'}</span>
                        <span className="mt-3 text-[10px] text-gray-600">Video files · Maximum 500 MB</span>
                      </button>
                      <input ref={fileInput} type="file" accept="video/*" className="hidden" onChange={(event) => handleFile(event.target.files?.[0])} />
                      <button type="submit" disabled={isProcessing || !selectedFile} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">{isProcessing ? <><LoaderCircle size={17} className="animate-spin" />Processing video...</> : <><Sparkles size={17} />Generate study kit</>}</button>
                    </form>
                  )}

                  {isProcessing && <div className="mt-5 rounded-xl border border-violet-400/20 bg-violet-500/[0.06] p-4"><div className="flex items-center gap-3"><LoaderCircle className="animate-spin text-violet-300" size={19} /><div><p className="text-sm font-medium">Gemini is analyzing your lecture</p><p className="mt-1 text-xs text-gray-400">This can take a little while. Keep this page open.</p></div></div></div>}
                  {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-500/[0.07] p-4 text-sm text-rose-200"><AlertCircle size={18} className="mt-0.5 shrink-0" /><span>{error}</span></div>}
                  {uploadMessage && !error && <p role="status" className="mt-4 flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 size={16} />{uploadMessage}</p>}
                </div>
              </section>

              <section className="mt-10">
                <div className="mb-5 flex items-center justify-between gap-3"><div><p className="text-xs font-semibold tracking-[0.16em] text-violet-300">PICK UP WHERE YOU LEFT OFF</p><h2 className="mt-2 text-xl font-semibold">Recent lectures</h2></div><button onClick={() => setActivePage('My Lectures')} className="text-xs font-medium text-gray-400 transition hover:text-violet-300">View all <ChevronRight size={14} className="ml-1 inline" /></button></div>
                <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#111118]">
                  {lecturesLoading ? (
  <div className="p-8 text-center text-sm text-gray-400">
    Loading your saved lectures...
  </div>
) : filteredLectures.length === 0 ? (
  <div className="p-8 text-center text-sm text-gray-500">
    No saved lectures yet. Process your first lecture to get started.
  </div>
) : filteredLectures.slice(0, 5).map((lecture, index) => (
                    <div key={`${lecture.title}-${index}`} className={`flex flex-wrap items-center gap-4 px-5 py-4 transition hover:bg-white/[0.025] ${index > 0 ? 'border-t border-white/[0.06]' : ''}`}>
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${lecture.color === 'violet' ? 'bg-violet-500/10 text-violet-300' : lecture.color === 'blue' ? 'bg-blue-500/10 text-blue-300' : 'bg-pink-500/10 text-pink-300'}`}><Video size={20} /></span>
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{lecture.title}</p><p className="mt-1 text-xs text-gray-500">{lecture.subject}</p></div>
                      <span className="flex items-center gap-1.5 text-xs text-gray-500"><Clock3 size={14} />{lecture.duration}</span>
                      <span className="hidden w-20 text-right text-xs text-gray-500 sm:block">{lecture.date}</span>
                      <button onClick={() => openLecture(lecture)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-gray-300 hover:border-violet-400/30 hover:text-violet-300">Open</button>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {activePage !== 'Overview' && (
            <section className="animate-fade-up">
              <div className="mb-8"><p className="text-xs font-semibold tracking-[0.16em] text-violet-300">RECAPIFY WORKSPACE</p><h1 className="mt-3 text-3xl font-semibold">{activePage}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-gray-400">Your lecture materials are generated by AI and organized here for revision.</p></div>
              {activePage === 'My Lectures' ? (
                <div className="space-y-3">
                  {filteredLectures.map((lecture, index) => (
                    <div key={`${lecture.title}-${index}`} className="flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-[#111118] p-5">
                      <Video className="shrink-0 text-violet-300" size={22} />
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{lecture.title}</p><p className="mt-1 text-xs text-gray-500">{lecture.subject} · {lecture.duration}</p></div>
                      <button onClick={() => openLecture(lecture)} className="rounded-lg border border-white/10 px-3 py-2 text-xs hover:border-violet-400/30">Study</button>
                    </div>
                  ))}
                  {filteredLectures.length === 0 && <p className="py-10 text-center text-sm text-gray-500">No lectures match your search.</p>}
                </div>
              ) : activePage === 'Settings' ? (
                <div className="rounded-2xl border border-white/[0.07] bg-[#111118] p-6"><div className="flex items-start gap-4"><Settings className="text-violet-300" size={22} /><div><h2 className="font-semibold">Your study preferences</h2><p className="mt-2 text-sm leading-6 text-gray-400">Recapify currently uses your local backend at {API_BASE}. Your Gemini API key stays on the server.</p></div></div></div>
              ) : renderStudyKit()}
            </section>
          )}

          <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] py-6 text-xs text-gray-600"><p><span className="font-semibold text-gray-400">Recapify</span> · Your lectures. Reimagined.</p><p>Built for curious minds <span className="text-violet-400">✦</span></p></footer>
        </div>
      </main>
    </div>
  );
}


function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      const { data, error } = await supabase.auth.getSession();

      if (!active) return;

      if (error) {
        console.error('Could not load authentication session:', error);
      }

      setSession(data?.session ?? null);
      setAuthLoading(false);
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setAuthLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Could not sign out:', error);
    }
  }

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b0b10] text-gray-300">
        <div className="flex items-center gap-3">
          <LoaderCircle size={22} className="animate-spin text-violet-400" />
          <span>Loading Recapify...</span>
        </div>
      </main>
    );
  }

  if (!session) {
    return <Auth />;
  }

  return (
    <Dashboard
      key={session.user.id}
      user={session.user}
      onSignOut={handleSignOut}
    />
  );
}

export default App;
