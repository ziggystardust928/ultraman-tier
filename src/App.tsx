import { Route, Routes, useLocation } from 'react-router-dom';
import { TabBar } from './components/ui';
import Home from './pages/Home';
import SeriesList from './pages/SeriesList';
import SeriesDetail from './pages/SeriesDetail';
import EpisodeDetail from './pages/EpisodeDetail';
import Ranking from './pages/Ranking';
import SearchPage from './pages/Search';
import People from './pages/People';
import PersonDetail from './pages/PersonDetail';
import Methodology from './pages/Methodology';

/** Which bottom-tab should light up for a given route. */
function activeTab(pathname: string): string {
  if (pathname === '/') return '/';
  if (pathname.startsWith('/series') || pathname.startsWith('/ep/')) return '/series';
  if (pathname.startsWith('/ranking')) return '/ranking';
  if (pathname.startsWith('/people') || pathname.startsWith('/person/')) return '/people';
  if (pathname.startsWith('/search')) return '/search';
  return '';
}

export default function App() {
  const { pathname } = useLocation();
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/series" element={<SeriesList />} />
        <Route path="/series/:seriesId" element={<SeriesDetail />} />
        <Route path="/ep/:episodeId" element={<EpisodeDetail />} />
        <Route path="/ranking" element={<Ranking />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/people" element={<People />} />
        <Route path="/person/:personId" element={<PersonDetail />} />
        <Route path="/methodology" element={<Methodology />} />
      </Routes>
      <TabBar active={activeTab(pathname)} />
    </div>
  );
}
