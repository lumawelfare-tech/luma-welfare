import { render, screen, within, fireEvent } from '@testing-library/react'
import { DataTable, type Column } from '../DataTable'

type Person = { id: string; name: string; age: number; department: string }

const cols: Column<Person>[] = [
  { key: 'name', header: 'Name', sortable: true },
  { key: 'age', header: 'Age', sortable: true },
  { key: 'department', header: 'Department', sortable: false },
]

const makeData = (count: number): Person[] =>
  Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    name: `Person ${i + 1}`,
    age: 20 + i,
    department: ['Engineering', 'HR', 'Finance'][i % 3],
  }))

describe('DataTable', () => {
  it('renders empty state when no data', () => {
    render(<DataTable data={[]} columns={cols} keyExtractor={(r) => r.id} />)
    expect(screen.getByText('No records found.')).toBeInTheDocument()
  })

  it('renders custom empty message', () => {
    render(<DataTable data={[]} columns={cols} keyExtractor={(r) => r.id} emptyMessage="Nothing here." />)
    expect(screen.getByText('Nothing here.')).toBeInTheDocument()
  })

  it('renders all rows in desktop table', () => {
    const data = makeData(3)
    const { container } = render(<DataTable data={data} columns={cols} keyExtractor={(r) => r.id} />)
    const desktopTable = container.querySelector('table')!
    expect(within(desktopTable).getByText('Person 1')).toBeInTheDocument()
    expect(within(desktopTable).getByText('Person 2')).toBeInTheDocument()
    expect(within(desktopTable).getByText('Person 3')).toBeInTheDocument()
  })

  it('sorts ascending on first click', () => {
    const data = [
      { id: '1', name: 'Charlie', age: 30, department: 'Engineering' },
      { id: '2', name: 'Alice', age: 25, department: 'HR' },
      { id: '3', name: 'Bob', age: 35, department: 'Finance' },
    ]
    const { container } = render(<DataTable data={data} columns={cols} keyExtractor={(r) => r.id} />)
    const desktopTable = container.querySelector('table')!
    fireEvent.click(within(desktopTable).getByText('Name'))
    const rows = within(desktopTable).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Alice')
    expect(rows[2]).toHaveTextContent('Bob')
    expect(rows[3]).toHaveTextContent('Charlie')
  })

  it('toggles sort direction on second click', () => {
    const data = [
      { id: '1', name: 'Charlie', age: 30, department: 'Engineering' },
      { id: '2', name: 'Alice', age: 25, department: 'HR' },
    ]
    const { container } = render(<DataTable data={data} columns={cols} keyExtractor={(r) => r.id} />)
    const desktopTable = container.querySelector('table')!
    fireEvent.click(within(desktopTable).getByText('Name'))
    fireEvent.click(within(desktopTable).getByText('Name'))
    const rows = within(desktopTable).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Charlie')
    expect(rows[2]).toHaveTextContent('Alice')
  })

  it('paginates when pageSize is exceeded', () => {
    const data = makeData(30)
    render(<DataTable data={data} columns={cols} keyExtractor={(r) => r.id} pageSize={10} />)
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument()
  })

  it('navigates to next page', () => {
    const data = makeData(30)
    render(<DataTable data={data} columns={cols} keyExtractor={(r) => r.id} pageSize={10} />)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument()
  })

  it('navigates to previous page', () => {
    const data = makeData(30)
    render(<DataTable data={data} columns={cols} keyExtractor={(r) => r.id} pageSize={10} />)
    const nextBtn = screen.getByRole('button', { name: 'Next' })
    fireEvent.click(nextBtn)
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument()
  })

  it('disables previous button on first page', () => {
    const data = makeData(30)
    render(<DataTable data={data} columns={cols} keyExtractor={(r) => r.id} pageSize={10} />)
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
  })

  it('disables next button on last page', () => {
    const data = makeData(30)
    render(<DataTable data={data} columns={cols} keyExtractor={(r) => r.id} pageSize={10} />)
    const nextBtn = screen.getByRole('button', { name: 'Next' })
    fireEvent.click(nextBtn)
    fireEvent.click(nextBtn)
    expect(nextBtn).toBeDisabled()
  })

  it('shows selection checkboxes when selectable', () => {
    const data = makeData(3)
    render(<DataTable data={data} columns={cols} keyExtractor={(r) => r.id} selectable getId={(r) => r.id} />)
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes.length).toBeGreaterThan(0)
  })

  it('calls onSelectionChange when row is selected', () => {
    const data = makeData(3)
    const onSelectionChange = vi.fn()
    render(
      <DataTable
        data={data}
        columns={cols}
        keyExtractor={(r) => r.id}
        selectable
        getId={(r) => r.id}
        onSelectionChange={onSelectionChange}
      />,
    )
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[1])
    expect(onSelectionChange).toHaveBeenCalled()
  })

  it('uses custom render function for column', () => {
    const customCols: Column<Person>[] = [
      { key: 'name', header: 'Name', render: (r) => <strong data-testid="custom-name">{r.name}</strong> },
      { key: 'age', header: 'Age' },
      { key: 'department', header: 'Department' },
    ]
    const data = makeData(1)
    const { container } = render(<DataTable data={data} columns={customCols} keyExtractor={(r) => r.id} />)
    const desktopTable = container.querySelector('table')!
    expect(within(desktopTable).getByTestId('custom-name')).toHaveTextContent('Person 1')
  })

  it('displays record count and page info', () => {
    const data = makeData(30)
    render(<DataTable data={data} columns={cols} keyExtractor={(r) => r.id} pageSize={10} />)
    expect(screen.getByText('30 records · Page 1 of 3')).toBeInTheDocument()
  })
})
