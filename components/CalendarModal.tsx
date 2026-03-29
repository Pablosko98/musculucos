import { WorkoutDAL } from '@/lib/db';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Calendar } from 'react-native-calendars';

type MarkedDates = Record<string, { marked: boolean; dotColor?: string }>;

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelectDate: (date: Date) => void;
};

const TODAY = format(new Date(), 'yyyy-MM-dd');

export function CalendarModal({ visible, onClose, onSelectDate }: Props) {
  const [currentMonth, setCurrentMonth] = useState(TODAY);
  const [markedDates, setMarkedDates] = useState<MarkedDates>({});

  useEffect(() => {
    if (!visible) return;
    const monthStart = startOfMonth(new Date(currentMonth));
    const from = format(monthStart, 'yyyy-MM-dd');
    const to = format(endOfMonth(monthStart), 'yyyy-MM-dd');
    WorkoutDAL.getWorkoutDatesInRange(from, to).then((dates) => {
      const marks: MarkedDates = {};
      for (const d of dates) marks[d] = { marked: true, dotColor: '#6b21a8' };
      setMarkedDates(marks);
    });
  }, [currentMonth, visible]);

  const goToToday = () => setCurrentMonth(TODAY);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center' }}
        onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{ width: '92%', borderRadius: 20, overflow: 'hidden', backgroundColor: '#121212' }}>
          <Calendar
            key={currentMonth}
            current={currentMonth}
            onMonthChange={(month) => setCurrentMonth(month.dateString)}
            onDayPress={(day) => {
              onSelectDate(new Date(day.dateString + 'T00:00:00'));
              onClose();
            }}
            markedDates={markedDates}
            firstDay={1}
            hideExtraDays={false}
            style={{ height: 370 }}
            theme={{
              calendarBackground: '#121212',
              textSectionTitleColor: '#525252',
              dayTextColor: '#ffffff',
              textDisabledColor: '#2a2a2a',
              todayTextColor: '#c084fc',
              selectedDayBackgroundColor: '#6b21a8',
              selectedDayTextColor: '#ffffff',
              monthTextColor: '#ffffff',
              arrowColor: '#a3a3a3',
              dotColor: '#6b21a8',
              'stylesheet.calendar.header': {
                header: {
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingHorizontal: 10,
                  backgroundColor: '#121212',
                  borderBottomWidth: 1,
                  borderBottomColor: '#262626',
                },
              },
            }}
          />
          <Pressable
            onPress={goToToday}
            style={{
              margin: 12,
              marginTop: 4,
              paddingVertical: 10,
              borderRadius: 10,
              backgroundColor: '#1e1030',
              borderWidth: 1,
              borderColor: '#6b21a8',
              alignItems: 'center',
            }}>
            <Text style={{ color: '#c084fc', fontWeight: '700', fontSize: 14 }}>Today</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
