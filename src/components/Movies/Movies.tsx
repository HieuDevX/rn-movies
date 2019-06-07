import MovieCarouselItem from '@components/Movies/MovieCarouselItem';
import CenterView from '@ui/CenterView';
import React, { FC } from 'react';
import { MoviesScreenProps } from '@screens/Movies/MoviesScreen';
import Spinner from 'react-native-spinkit';
import { colors } from '@styles/Colors';
import { SafeAreaView, ScrollView, StyleSheet } from 'react-native';
import Carousel from 'react-native-snap-carousel';
import { Movie } from '@api/Models';
import { dimensions } from '@styles/Dimensions';
import { useCarouselItem } from '@hooks/useCarouselItem';
import { useFetch } from '@hooks/useFetch';

const Movies: FC<MoviesScreenProps> = ({ fetchMovies, nowPlayings, isLoading }) => {
  const carouselItems = useCarouselItem<Movie>(nowPlayings, isLoading);

  useFetch(fetchMovies);

  const onItemTouched = (id: number) => {
    console.log({ id });
  };

  const renderCarouselItem = (item: { item: Movie; index: number }) => {
    return <MovieCarouselItem movie={ item.item } onMovieTouched={ onItemTouched }/>;
  };

  return (
    <SafeAreaView style={ styles.flexed }>
      { isLoading || !nowPlayings.length ? (
        <CenterView>
          <Spinner isVisible={ isLoading } color={ colors.primary } type={ 'Bounce' }/>
        </CenterView>
      ) : (
        <ScrollView style={ styles.flexed }>
          <Carousel data={ carouselItems }
                    renderItem={ renderCarouselItem }
                    sliderWidth={ dimensions.width }
                    itemWidth={ dimensions.width - 50 }
                    horizontal/>
        </ScrollView>
      ) }
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  flexed: {
    flex: 1
  }
});

export default Movies;
