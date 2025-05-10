# DayTune

DayTune is an adaptive daily planner that re-tunes your calendar based on energy, mood, and shifting tasks. It helps you manage your time more effectively by considering task importance, deadlines, and your personal energy levels.

## Features

### Task Management
- Create tasks with flexible or fixed time slots
- Set task importance (1-5 scale)
- Define task duration
- Set optional deadlines
- Mark tasks as fixed time or flexible

### Smart Scheduling
- Automatically schedules tasks based on importance and deadlines
- Handles task conflicts intelligently
- Provides clear feedback when tasks cannot be scheduled
- Adjusts schedule when tasks overrun their estimated duration

### Mood & Energy Tracking
- Track your mood throughout the day
- Record energy levels
- Use mood data to optimize task scheduling

### Break Management
- Automatic break scheduling
- Flexible break duration
- Skip breaks when deadlines are at risk

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- Supabase account

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/daytune.git
cd daytune
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with your Supabase credentials:
```
REACT_APP_SUPABASE_URL=your_supabase_url
REACT_APP_SUPABASE_KEY=your_supabase_anon_key
```

4. Start the development server:
```bash
npm start
```

## Database Schema

### Tasks Table
- `id`: UUID (primary key)
- `user_id`: UUID (foreign key to users table)
- `title`: String
- `due_date`: Date
- `due_time`: Time
- `is_deadline`: Boolean
- `is_fixed`: Boolean
- `duration_minutes`: Integer
- `importance`: Integer (1-5)
- `difficulty`: Integer (1-5)
- `created_at`: Timestamp
- `updated_at`: Timestamp

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with React and Supabase
- Uses Tailwind CSS for styling
- Inspired by the need for more adaptive and intelligent task management
