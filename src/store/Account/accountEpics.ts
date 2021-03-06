import { addToWatchList, getAccountDetail, getAccountMedias, markFavorite } from '@api/Account';
import { Session, Movie, Account, TvShow } from '@api/Models';
import { accountActions } from '@store/Account/accountActions';
import { AccountActions } from '@store/Account/accountReducer';
import { ConfigurationState } from '@store/Configurations/configurationReducer';
import { AppState } from '@store/configureStore';
import { moviesActions } from '@store/Movies/moviesActions';
import { showsActions } from '@store/Shows/showsActions';
import { ActionsObservable, StateObservable } from 'redux-observable';
import { forkJoin, iif } from 'rxjs';
import { catchError, filter, map, pluck, switchMap, tap, withLatestFrom } from 'rxjs/operators';
import { isActionOf } from 'typesafe-actions';
import { from } from 'rxjs/internal/observable/from';
import { of } from 'rxjs/internal/observable/of';

const getAccountDetailEpic = (
  action$: ActionsObservable<AccountActions>,
  state$: StateObservable<AppState>
) => action$.pipe(
  filter(isActionOf(accountActions.getAccountDetail)),
  withLatestFrom(state$),
  switchMap(([_, state]) => {
    return from(getAccountDetail((state.authState.session as Session).session_id)).pipe(
      map(account => {
        account.avatar_url = `https://www.gravatar.com/avatar/${ account.avatar.gravatar.hash }.jpg?s=200`;
        return accountActions.getAccountDetailSuccess(account);
      }),
      catchError(err => of(accountActions.getAccountDetailFailed(err)))
    );
  })
);

const getAccountMoviesEpic = (
  action$: ActionsObservable<AccountActions>,
  state$: StateObservable<AppState>
) => action$.pipe(
  filter(isActionOf(accountActions.getAccountMovies)),
  withLatestFrom(state$),
  switchMap(([action, state]) => {
    const { type, page } = action.payload;
    const accountId = (state.accountState.account as Account).id;
    const sessionId = (state.authState.session as Session).session_id;

    if (page === 1 && !!(state.accountState as any)[`${ type }Movies`].length) {
      return of(accountActions.getAccountMoviesSuccess(type, []));
    }

    return from(getAccountMedias<Movie>(accountId, sessionId, 'movies', type, page)).pipe(
      map(movies => {
        movies.results = mapConfigurationToMovies(state.configurationState)(movies.results);
        return accountActions.getAccountMoviesSuccess(type, movies.results);
      }),
      catchError(() => of(accountActions.getAccountMoviesFailed()))
    );
  })
);

const mapConfigurationToMovies = (configuration: ConfigurationState) => (movies: Array<Movie & { rating: number }>) => {
  for (let i = 0, len = movies.length; i < len; i++) {
    const movie = movies[i];
    movie.genre_names = movie.genre_ids.map(id => configuration.movieGenres[id]);
    movie.backdrop_path = `${ configuration.backdropPath }${ movie.backdrop_path }`;
    movie.poster_path = `${ configuration.posterPath }${ movie.poster_path }`;
  }

  return movies;
};

const getAccountShowsEpic = (
  action$: ActionsObservable<AccountActions>,
  state$: StateObservable<AppState>
) => action$.pipe(
  filter(isActionOf(accountActions.getAccountShows)),
  withLatestFrom(state$),
  switchMap(([action, state]) => {
    const { type, page } = action.payload;
    const accountId = (state.accountState.account as Account).id;
    const sessionId = (state.authState.session as Session).session_id;

    if (page === 1 && !!(state.accountState as any)[`${ type }Shows`].length) {
      return of(accountActions.getAccountShowsSuccess(type, []));
    }

    return from(getAccountMedias<TvShow>(accountId, sessionId, 'tv', type, page)).pipe(
      map(shows => {
        shows.results = mapConfigurationToShows(state.configurationState)(shows.results);
        return accountActions.getAccountShowsSuccess(type, shows.results);
      }),
      catchError(() => of(accountActions.getAccountShowsFailed()))
    );
  })
);

const mapConfigurationToShows = (configuration: ConfigurationState) => (shows: Array<TvShow & { rating: number }>) => {
  for (let i = 0, len = shows.length; i < len; i++) {
    const show = shows[i];
    show.genre_names = show.genre_ids.map(id => configuration.movieGenres[id]);
    show.backdrop_path = `${ configuration.backdropPath }${ show.backdrop_path }`;
    show.poster_path = `${ configuration.posterPath }${ show.poster_path }`;
  }

  return shows;
};

const getAccountMediaCount = (
  action$: ActionsObservable<AccountActions>,
  state$: StateObservable<AppState>
) => action$.pipe(
  filter(isActionOf(accountActions.getAccountMediaCount)),
  withLatestFrom(state$),
  switchMap(([, state]) => {
    const accountId = (state.accountState.account as Account).id;
    const sessionId = (state.authState.session as Session).session_id;
    const fetches = [
      from(getAccountMedias<TvShow>(accountId, sessionId, 'tv', 'watchlist')).pipe(pluck('total_results')),
      from(getAccountMedias<TvShow>(accountId, sessionId, 'tv', 'favorite')).pipe(pluck('total_results')),
      from(getAccountMedias<TvShow>(accountId, sessionId, 'tv', 'rated')).pipe(pluck('total_results')),
      from(getAccountMedias<Movie>(accountId, sessionId, 'movies', 'watchlist')).pipe(pluck('total_results')),
      from(getAccountMedias<Movie>(accountId, sessionId, 'movies', 'favorite')).pipe(pluck('total_results')),
      from(getAccountMedias<Movie>(accountId, sessionId, 'movies', 'rated')).pipe(pluck('total_results')),
    ];

    return forkJoin(fetches).pipe(
      map(([watchlistTv, favTv, ratedTv, watchlistMovies, favMovies, ratedMovies]) => {
        return {
          watchlist: watchlistTv + watchlistMovies,
          favorites: favTv + favMovies,
          ratings: ratedTv + ratedMovies
        };
      }),
      map(({ watchlist, favorites, ratings }) => accountActions.getAccountMediaCountSuccess(watchlist,
        favorites,
        ratings)),
      catchError(() => of(accountActions.getAccountMediaCountFailed()))
    );
  })
);

const getAverageMoviesRatingEpic = (
  action$: ActionsObservable<AccountActions>,
  state$: StateObservable<AppState>
) => {
  let accountId: number;
  let sessionId: string;
  let flattenRatings: number[] = [];
  return action$.pipe(
    filter(isActionOf(accountActions.getAverageMoviesRating)),
    withLatestFrom(state$),
    switchMap(([_, state]) => {
      accountId = (state.accountState.account as Account).id;
      sessionId = (state.authState.session as Session).session_id;
      return from(getAccountMedias<Movie>(accountId, sessionId, 'movies', 'rated')).pipe(
        tap(result => {
          flattenRatings.push(...result.results.map(r => r.rating));
        }),
        pluck('total_pages')
      );
    }),
    switchMap(pages => {
      const ratedMoviesFetched = [];
      const getAverage = (arr: number[]) => arr.reduce((avg, cur) => avg + cur) / arr.length;

      if (pages < 2) {
        const average = getAverage(flattenRatings);
        return of(accountActions.getAverageMoviesRatingSuccess(average));
      }

      for (let i = 2; i <= pages; i++) {
        ratedMoviesFetched.push(
          from(getAccountMedias<Movie>(accountId, sessionId, 'movies', 'rated', i)).pipe(
            pluck('results'),
            map(results => results.map(r => r.rating))
          )
        );
      }

      return forkJoin(ratedMoviesFetched).pipe(
        map(ratings => {
          flattenRatings = flattenRatings.concat(...ratings);
          return getAverage(flattenRatings);
        }),
        map(average => accountActions.getAverageMoviesRatingSuccess(average)),
        catchError(() => of(accountActions.getAverageMoviesRatingFailed()))
      );
    })
  );
};

const getAverageShowsRatingEpic = (
  action$: ActionsObservable<AccountActions>,
  state$: StateObservable<AppState>
) => {
  let accountId: number;
  let sessionId: string;
  let flattenRatings: number[] = [];
  return action$.pipe(
    filter(isActionOf(accountActions.getAverageShowsRating)),
    withLatestFrom(state$),
    switchMap(([_, state]) => {
      accountId = (state.accountState.account as Account).id;
      sessionId = (state.authState.session as Session).session_id;
      return from(getAccountMedias<TvShow>(accountId, sessionId, 'tv', 'rated')).pipe(
        tap(result => {
          flattenRatings.push(...result.results.map(r => r.rating));
        }),
        pluck('total_pages')
      );
    }),
    switchMap(pages => {
      const ratedMoviesFetched = [];
      const getAverage = (arr: number[]) => arr.reduce((avg, cur) => avg + cur) / arr.length;

      if (pages < 2) {
        const average = getAverage(flattenRatings);
        return of(accountActions.getAverageShowsRatingSuccess(average));
      }

      for (let i = 2; i <= pages; i++) {
        ratedMoviesFetched.push(
          from(getAccountMedias<Movie>(accountId, sessionId, 'movies', 'rated', i)).pipe(
            pluck('results'),
            map(results => results.map(r => r.rating))
          )
        );
      }

      return forkJoin(ratedMoviesFetched).pipe(
        map(ratings => {
          flattenRatings = flattenRatings.concat(...ratings);
          return getAverage(flattenRatings);
        }),
        map(average => accountActions.getAverageShowsRatingSuccess(average)),
        catchError(() => of(accountActions.getAverageShowsRatingFailed()))
      );
    })
  );
};

const toggleWatchlistEpic = (
  action$: ActionsObservable<AccountActions>,
  state$: StateObservable<AppState>
) => action$.pipe(
  filter(isActionOf(accountActions.toggleWatchlist)),
  withLatestFrom(state$),
  switchMap(([action, state]) => {
    const { media_id, media_type } = action.payload;
    const accountId = (state.accountState.account as Account).id;
    const sessionId = (state.authState.session as Session).session_id;
    return from(addToWatchList(accountId, sessionId, action.payload)).pipe(
      map(() => {
        if (media_type === 'movie') {
          return moviesActions.fetchMovieAccountStates(media_id);
        }

        return showsActions.fetchShowAccountStates(media_id);
      })
    );
  })
);

const toggleFavoriteEpic = (
  action$: ActionsObservable<AccountActions>,
  state$: StateObservable<AppState>
) => action$.pipe(
  filter(isActionOf(accountActions.toggleFavorite)),
  withLatestFrom(state$),
  switchMap(([action, state]) => {
    const { media_id, media_type } = action.payload;
    const accountId = (state.accountState.account as Account).id;
    const sessionId = (state.authState.session as Session).session_id;
    return from(markFavorite(accountId, sessionId, action.payload)).pipe(
      map(() => {
        if (media_type === 'movie') {
          return moviesActions.fetchMovieAccountStates(media_id);
        }

        return showsActions.fetchShowAccountStates(media_id);
      })
    );
  })
);

export const accountEpics = [
  getAccountDetailEpic,
  getAccountMoviesEpic,
  getAccountShowsEpic,
  getAverageMoviesRatingEpic,
  getAverageShowsRatingEpic,
  getAccountMediaCount,
  toggleFavoriteEpic,
  toggleWatchlistEpic
];
