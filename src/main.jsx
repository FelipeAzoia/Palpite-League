import { useState } from 'react'
import {
  ArrowRight,
  Bell,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Clock3,
  Home,
  LayoutGrid,
  Medal,
  Menu,
  Search,
  Settings2,
  ShieldCheck,
  Swords,
  Trophy,
  Users,
  X,
} from 'lucide-react'
import './styles.css'

const matches = [
  { id: 1, home: 'Flamengo', away: 'Palmeiras', homeShort: 'FLA', awayShort: 'PAL', time: 'Hoje, 21:30', round: 'Rodada 14', accent: 'red', status: 'Abre para palpites' },
  { id: 2, home: 'Botafogo', away: 'Atlético-MG', homeShort: 'BOT', awayShort: 'CAM', time: 'Amanhã, 16:00', round: 'Rodada 14', accent: 'black', status: 'Palpite pendente' },
  { id: 3, home: 'São Paulo', away: 'Grêmio', homeShort: 'SAO', awayShort: 'GRE', time: 'Sáb, 18:30', round: 'Rodada 14', accent: 'red', status: 'Palpite pendente' },
]

const ranking = [
  { place: 1, name: 'Marina Costa', points: 148, medal: 'crown' },
  { place: 2, name: 'Você', points: 142, medal: 'you' },
  { place: 3, name: 'Lucas Mendes', points: 137, medal: 'silver' },
  { place: 4, name: 'Ana Clara', points: 130, medal: 'bronze' },
]

function TeamMark({ short, accent }) {
  return <span className={`team-mark team-mark--${accent}`}>{short}</span>
}

function App() {
  const [activeNav, setActiveNav] = useState('Visão geral')
  const [selectedMatch, setSelectedMatch] = useState(1)
  const [guessMode, setGuessMode] = useState('resultado')
  const [guess, setGuess] = useState('')
  const [savedGuesses, setSavedGuesses] = useState({})
  const [menuOpen, setMenuOpen] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)

  const currentMatch = matches.find((match) => match.id === selectedMatch)

  function saveGuess() {
    if (!guess.trim()) return
    setSavedGuesses((current) => ({ ...current, [selectedMatch]: `${guess} · ${guessMode === 'resultado' ? 'resultado' : 'placar exato'}` }))
    setGuess('')
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'sidebar--open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><Swords size={19} strokeWidth={2.7} /></div>
          <span>palpite<span className="brand-highlight">.</span></span>
        </div>
        <button className="sidebar-close" aria-label="Fechar menu" onClick={() => setMenuOpen(false)}><X size={19} /></button>

        <div className="workspace-switcher">
          <div className="workspace-avatar">B</div>
          <div><span className="eyebrow">Meu bolão</span><strong>Brasileirão 2026</strong></div>
          <ChevronDown size={16} />
        </div>

        <nav className="main-nav" aria-label="Navegação principal">
          <span className="nav-label">Menu</span>
          {[
            [Home, 'Visão geral'],
            [LayoutGrid, 'Meus palpites'],
            [Trophy, 'Ranking'],
            [CalendarDays, 'Calendário'],
          ].map(([Icon, label]) => (
            <button key={label} className={`nav-item ${activeNav === label ? 'nav-item--active' : ''}`} onClick={() => { setActiveNav(label); setMenuOpen(false) }}>
              <Icon size={18} /><span>{label}</span>{label === 'Meus palpites' && <span className="nav-count">3</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="nav-item"><CircleHelp size={18} /><span>Central de ajuda</span></button>
          <button className="nav-item"><Settings2 size={18} /><span>Configurações</span></button>
          <div className="profile-mini">
            <div className="profile-avatar">GS</div>
            <div><strong>Gabriel Santos</strong><span>Participante</span></div>
            <ChevronDown size={15} />
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Abrir menu" onClick={() => setMenuOpen(true)}><Menu size={21} /></button>
          <div className="breadcrumb"><span>Meus bolões</span><ArrowRight size={14} /><strong>Brasileirão 2026</strong></div>
          <div className="topbar-actions">
            <button className="icon-button" aria-label="Buscar"><Search size={19} /></button>
            <div className="notification-wrap">
              <button className="icon-button has-notification" aria-label="Notificações" onClick={() => setShowNotifications((current) => !current)}><Bell size={19} /></button>
              {showNotifications && <div className="notification-popover"><strong>Você está em 2º lugar!</strong><span>Marina abriu 6 pontos de vantagem.</span></div>}
            </div>
            <div className="topbar-user"><div className="profile-avatar">GS</div><div><strong>Gabriel Santos</strong><span>Participante</span></div><ChevronDown size={15} /></div>
          </div>
        </header>

        <div className="content-wrap">
          <section className="welcome-row">
            <div><p className="kicker">Quinta-feira, 23 de outubro</p><h1>Boa noite, Gabriel<span className="title-dot">.</span></h1><p className="welcome-copy">A rodada está esquentando. Você tem <strong>3 palpites</strong> para fazer.</p></div>
            <button className="outline-button"><Users size={17} /> Convidar amigos</button>
          </section>

          <section className="stats-grid" aria-label="Resumo do bolão">
            <article className="stat-card stat-card--primary"><div className="stat-icon"><Trophy size={18} /></div><span className="stat-label">Minha pontuação</span><strong className="stat-value">142 <small>pts</small></strong><span className="stat-trend"><span>↑ 12 pts</span> nesta rodada</span></article>
            <article className="stat-card"><div className="stat-icon stat-icon--lime"><Medal size={18} /></div><span className="stat-label">Posição no ranking</span><strong className="stat-value">2<small>º lugar</small></strong><span className="stat-trend">Você está no <b>top 10%</b></span></article>
            <article className="stat-card"><div className="stat-icon stat-icon--blue"><Swords size={18} /></div><span className="stat-label">Aproveitamento</span><strong className="stat-value">78<small>%</small></strong><span className="stat-trend">↑ 4% vs. rodada anterior</span></article>
            <article className="stat-card stat-card--accent"><div className="stat-card-top"><span className="stat-label">Próxima rodada</span><CalendarDays size={17} /></div><strong className="round-value">Rodada 14</strong><span className="stat-trend"><Clock3 size={14} /> começa em 2 dias</span></article>
          </section>

          <div className="section-grid">
            <section className="matches-section">
              <div className="section-heading"><div><p className="kicker">Sua próxima chance</p><h2>Palpites em aberto</h2></div><button className="text-button" onClick={() => setActiveNav('Meus palpites')}>Ver todos <ArrowRight size={16} /></button></div>
              <div className="matches-list">
                {matches.map((match) => <article key={match.id} className={`match-card ${selectedMatch === match.id ? 'match-card--selected' : ''}`} onClick={() => { setSelectedMatch(match.id); setGuess('') }}>
                  <div className="match-meta"><span className={match.id === 1 ? 'live-tag' : ''}>{match.id === 1 && <i />}{match.status}</span><span>{match.round}</span></div>
                  <div className="match-teams"><div className="team"><TeamMark short={match.homeShort} accent={match.accent} /><strong>{match.home}</strong></div><div className="match-time"><strong>{match.time.split(', ')[1]}</strong><span>{match.time.split(', ')[0]}</span></div><div className="team team--away"><TeamMark short={match.awayShort} accent={match.id === 2 ? 'gray' : 'green'} /><strong>{match.away}</strong></div></div>
                  {savedGuesses[match.id] ? <div className="saved-guess"><ShieldCheck size={15} /> Seu palpite: <b>{savedGuesses[match.id]}</b></div> : <button className="match-action" onClick={(event) => { event.stopPropagation(); setSelectedMatch(match.id); document.getElementById('guess-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }}>Dar palpite <ArrowRight size={15} /></button>}
                </article>)}
              </div>
            </section>

            <section className="ranking-section"><div className="section-heading"><div><p className="kicker">Competição acirrada</p><h2>Ranking do bolão</h2></div><button className="text-button" onClick={() => setActiveNav('Ranking')}>Ver ranking <ArrowRight size={16} /></button></div><div className="ranking-card"><div className="ranking-head"><span>Participante</span><span>Pontos</span></div>{ranking.map((person) => <div className={`ranking-row ${person.name === 'Você' ? 'ranking-row--you' : ''}`} key={person.place}><span className={`place place--${person.medal}`}>{person.place}</span><div className="ranking-avatar">{person.name.split(' ').map((part) => part[0]).join('')}</div><strong>{person.name}</strong><b>{person.points}</b></div>)}<div className="ranking-foot"><span><span className="ranking-dot" /> Você está a <b>6 pontos</b> da liderança</span><ArrowRight size={16} /></div></div></section>
          </div>

          <section className="guess-panel" id="guess-panel"><div className="guess-intro"><div className="guess-number">01</div><div><p className="kicker">Palpite selecionado</p><h2>{currentMatch.home} <span>×</span> {currentMatch.away}</h2><p><Clock3 size={14} /> Limite para palpitar: <strong>{currentMatch.time}</strong></p></div></div><div className="guess-controls"><div className="segmented-control"><button className={guessMode === 'resultado' ? 'active' : ''} onClick={() => setGuessMode('resultado')}>Resultado</button><button className={guessMode === 'placar' ? 'active' : ''} onClick={() => setGuessMode('placar')}>Placar exato</button></div><div className="guess-input-wrap"><input value={guess} onChange={(event) => setGuess(event.target.value)} placeholder={guessMode === 'resultado' ? 'Ex.: Flamengo vence' : 'Ex.: 2 × 1'} aria-label="Seu palpite" /><button className="save-button" onClick={saveGuess}>Salvar palpite <ArrowRight size={16} /></button></div></div></section>
          <footer className="page-footer"><span><ShieldCheck size={15} /> Resultados oficiais sincronizados automaticamente</span><span>Bolão privado · 24 participantes</span></footer>
        </div>
      </main>
    </div>
  )
}

export default App