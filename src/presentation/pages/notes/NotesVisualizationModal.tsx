import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import AppButton from '../../../shared/ui/AppButton'
import AppModal from '../../../shared/ui/AppModal'
import type { NoteVisualization } from './noteReportParser'
import { nt } from './notesText'

const COLORS = ['#2458D3', '#4F46E5', '#059669', '#D97706', '#DC2626', '#7C3AED', '#0891B2']

type NotesVisualizationModalProps = {
  items: NoteVisualization[]
  onClose: () => void
  onInsertTables?: () => void
}

function ChartBlock({ item }: { item: NoteVisualization }) {
  if (item.kind === 'table') {
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {item.columns.map((column) => (
                <th
                  key={column}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderBottom: '1px solid #DDE3EE',
                    color: '#64748B',
                    fontWeight: 700,
                    background: '#F8FAFC',
                  }}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {item.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td
                    key={`${rowIndex}-${cellIndex}`}
                    style={{
                      padding: '10px 12px',
                      borderBottom: '1px solid #EEF2F7',
                      color: '#0F172A',
                    }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const height = item.kind === 'pie' ? 280 : 260

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        {item.kind === 'line' ? (
          <LineChart data={item.data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis dataKey="name" tick={{ fill: '#64748B', fontSize: 12 }} />
            <YAxis tick={{ fill: '#64748B', fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="value" name={nt('visualization.t00')} stroke="#2458D3" strokeWidth={3} dot={{ r: 4 }} />
          </LineChart>
        ) : item.kind === 'bar' ? (
          <BarChart data={item.data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis dataKey="name" tick={{ fill: '#64748B', fontSize: 12 }} />
            <YAxis tick={{ fill: '#64748B', fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="value" name={nt('visualization.t00')} radius={[8, 8, 0, 0]}>
              {item.data.map((_, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        ) : (
          <PieChart>
            <Tooltip formatter={(value) => [`${String(value ?? 0)}%`, nt('visualization.t01')]} />
            <Legend />
            <Pie
              data={item.data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={92}
              label={({ name, value }) => `${name}: ${value}%`}
            >
              {item.data.map((_, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

export default function NotesVisualizationModal({
  items,
  onClose,
  onInsertTables,
}: NotesVisualizationModalProps) {
  const hasTables = items.some((item) => item.kind === 'table')

  return (
    <AppModal title={nt('visualization.t02')} onClose={onClose} maxWidth={920}>
      <div style={{ display: 'grid', gap: 20 }}>
        <p style={{ margin: 0, color: '#64748B', fontSize: 13, lineHeight: 1.5 }}>
          {nt('visualization.t03')}
        </p>

        {items.map((item, index) => (
          <section
            key={`${item.kind}-${item.title}-${index}`}
            style={{
              border: '1px solid #E2E8F0',
              borderRadius: 16,
              padding: 16,
              background: '#FFFFFF',
            }}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#0F172A' }}>
              {item.title}
            </h3>
            <ChartBlock item={item} />
          </section>
        ))}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          {hasTables && onInsertTables ? (
            <AppButton variant="secondary" onClick={onInsertTables}>
              {nt('visualization.t04')}
            </AppButton>
          ) : null}
          <AppButton onClick={onClose}>{nt('visualization.t05')}</AppButton>
        </div>
      </div>
    </AppModal>
  )
}
